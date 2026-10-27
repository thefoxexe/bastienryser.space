"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import mammoth from "mammoth";
import { z } from "zod";
import { claude, friendlyError, MODEL, NO_KEY } from "@/lib/ai/claude";
import { requireAdmin } from "@/lib/auth";
import { lastDays } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string };

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const refresh = (slug: string) => revalidatePath(`/b/${slug}/chantiers`, "layout");

/** Le chantier appartient bien au business de la page (les identifiants viennent du formulaire). */
async function projectOf(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("id,business_id,name").eq("id", id).maybeSingle();
  return data;
}

// --- Chantiers ---------------------------------------------------------------

const projectSchema = z.object({
  businessId: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Donne un nom au chantier.").max(120),
  client: optionalText(120),
  url: optionalText(300),
  description: optionalText(4000),
  dueDate: optionalDate,
});

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ business_id: p.businessId, name: p.name, client: p.client, url: p.url, description: p.description, due_date: p.dueDate })
    .select("id")
    .single();
  if (error || !data) return { error: "Création impossible. La migration des chantiers est-elle appliquée ?" };
  refresh(p.slug);
  redirect(`/b/${p.slug}/chantiers/${data.id}`);
}

export async function updateProject(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = projectSchema.extend({ id: z.string().uuid(), status: z.enum(["active", "paused", "done"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ name: p.name, client: p.client, url: p.url, description: p.description, due_date: p.dueDate, status: p.status, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("business_id", p.businessId);
  if (error) return { error: "Enregistrement impossible." };
  refresh(p.slug);
  return { ok: true };
}

export async function deleteProject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const slug = String(formData.get("slug"));
  const supabase = await createClient();
  const { data: files } = await supabase.from("project_files").select("storage_path").eq("project_id", id);
  if (files?.length) await supabase.storage.from("project-files").remove(files.map((f) => f.storage_path));
  await supabase.from("projects").delete().eq("id", id);
  refresh(slug);
  redirect(`/b/${slug}/chantiers`);
}

// --- Tâches -----------------------------------------------------------------

const taskSchema = z.object({
  projectId: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().trim().min(1, "Écris la tâche.").max(200),
  notes: optionalText(4000),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  dueDate: optionalDate,
});

export async function addTask(_prev: FormState, formData: FormData): Promise<FormState & { nonce?: number }> {
  await requireAdmin();
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const t = parsed.data;
  if (!(await projectOf(t.projectId))) return { error: "Chantier introuvable." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("project_tasks").select("position").eq("project_id", t.projectId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("project_tasks")
    .insert({ project_id: t.projectId, title: t.title, notes: t.notes, priority: t.priority, due_date: t.dueDate, position: (last?.position ?? 0) + 1 });
  if (error) return { error: "Ajout impossible." };
  refresh(t.slug);
  return { ok: true, nonce: Date.now() };
}

const taskUpdate = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function updateTask(input: z.input<typeof taskUpdate>): Promise<FormState> {
  await requireAdmin();
  const parsed = taskUpdate.safeParse(input);
  if (!parsed.success) return { error: "Modification invalide." };
  const t = parsed.data;
  const patch: Record<string, unknown> = {};
  if (t.status) {
    patch.status = t.status;
    patch.done_at = t.status === "done" ? new Date().toISOString() : null;
  }
  if (t.priority) patch.priority = t.priority;
  if (t.title) patch.title = t.title;
  if (t.notes !== undefined) patch.notes = t.notes || null;
  if (t.dueDate !== undefined) patch.due_date = t.dueDate || null;
  const supabase = await createClient();
  const { error } = await supabase.from("project_tasks").update(patch).eq("id", t.id);
  if (error) return { error: "Modification impossible." };
  refresh(t.slug);
  return { ok: true };
}

export async function deleteTask(id: string, slug: string): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("project_tasks").delete().eq("id", z.string().uuid().parse(id));
  refresh(slug);
  return { ok: true };
}

// --- Pièces jointes ----------------------------------------------------------

const MAX_FILE = 50 * 1024 * 1024;

/** Prépare un envoi direct vers le stockage (le fichier ne transite pas par le serveur du site). */
export async function prepareFileUpload(input: { projectId: string; name: string; size: number }) {
  await requireAdmin();
  if (!(await projectOf(input.projectId))) return { error: "Chantier introuvable." } as const;
  if (input.size > MAX_FILE) return { error: "Fichier trop lourd (50 Mo max)." } as const;
  const ext = (input.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin").toLowerCase();
  const path = `${input.projectId}/${randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("project-files").createSignedUploadUrl(path);
  if (error || !data) return { error: "Impossible de préparer l'envoi. La migration des chantiers est-elle appliquée ?" } as const;
  return { path, token: data.token } as const;
}

export async function recordFile(input: { projectId: string; slug: string; path: string; name: string; size: number; mime: string }): Promise<FormState> {
  await requireAdmin();
  if (!input.path.startsWith(`${input.projectId}/`)) return { error: "Fichier invalide." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_files")
    .insert({ project_id: input.projectId, storage_path: input.path, name: input.name.slice(0, 200), size: input.size, mime: input.mime || null });
  if (error) return { error: "Enregistrement impossible." };
  refresh(input.slug);
  return { ok: true };
}

export async function deleteFile(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("project_files").select("storage_path").eq("id", String(formData.get("id"))).maybeSingle();
  if (data) {
    await supabase.storage.from("project-files").remove([data.storage_path]);
    await supabase.from("project_files").delete().eq("id", String(formData.get("id")));
  }
  refresh(String(formData.get("slug")));
}

// --- Finances liées ----------------------------------------------------------

export async function linkEntry(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId"));
  const entryId = String(formData.get("entryId"));
  const project = await projectOf(projectId);
  if (!project || !entryId) return;
  const supabase = await createClient();
  await supabase.from("ledger_entries").update({ project_id: projectId }).eq("id", entryId).eq("business_id", project.business_id);
  refresh(String(formData.get("slug")));
  revalidatePath(`/b/${String(formData.get("slug"))}/donnees`, "layout");
}

export async function unlinkEntry(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("ledger_entries").update({ project_id: null }).eq("id", String(formData.get("entryId")));
  refresh(String(formData.get("slug")));
}

// --- Import par l'IA ---------------------------------------------------------

const Extracted = z.object({
  summary: z.string().describe("Résumé du document en 2 ou 3 phrases."),
  tasks: z
    .array(
      z.object({
        title: z.string().describe("Tâche courte et actionnable, commençant par un verbe (« Intégrer la page Contact »)."),
        notes: z.string().describe("Détails utiles tirés du document (contenu, contraintes, contact), ou chaîne vide."),
        priority: z.enum(["low", "normal", "high"]),
        due_date: z.string().nullable().describe("Échéance AAAA-MM-JJ si le document en donne une (même relative à la date du jour), sinon null."),
      }),
    )
    .describe("Toutes les actions à faire, dans un ordre logique de réalisation, sans doublon avec les tâches existantes."),
});

export type ExtractedTasks = z.infer<typeof Extracted>;

const TEXT_TYPES = /\.(txt|md|markdown|csv|json|html?|rtf|srt|vtt)$/i;

/**
 * Lit un compte rendu (fichier déjà envoyé dans le stockage, ou texte collé) et propose des tâches.
 * Rien n'est créé ici : Bastien valide la liste avant l'ajout.
 */
export async function extractTasks(input: { projectId: string; path?: string; name?: string; text?: string }): Promise<{ ok: true; data: ExtractedTasks } | { ok: false; error: string }> {
  await requireAdmin();
  const anthropic = claude();
  if (!anthropic) return { ok: false, error: NO_KEY };
  const project = await projectOf(input.projectId);
  if (!project) return { ok: false, error: "Chantier introuvable." };
  const supabase = await createClient();

  type Block = { type: "text"; text: string } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
  let doc: Block | null = null;
  if (input.text?.trim()) doc = { type: "text", text: `Document collé :\n"""\n${input.text.slice(0, 200_000)}\n"""` };
  else if (input.path?.startsWith(`${input.projectId}/`)) {
    const { data: blob } = await supabase.storage.from("project-files").download(input.path);
    if (!blob) return { ok: false, error: "Fichier introuvable." };
    const name = input.name ?? input.path;
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (/\.pdf$/i.test(name)) doc = { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } };
    else if (/\.docx$/i.test(name)) doc = { type: "text", text: `Document Word « ${name} » :\n"""\n${(await mammoth.extractRawText({ buffer })).value.slice(0, 200_000)}\n"""` };
    else if (TEXT_TYPES.test(name)) doc = { type: "text", text: `Fichier « ${name} » :\n"""\n${buffer.toString("utf8").slice(0, 200_000)}\n"""` };
    else return { ok: false, error: "Format non pris en charge : PDF, Word (.docx) ou texte (.txt, .md…)." };
  }
  if (!doc) return { ok: false, error: "Ajoute un fichier ou colle un texte." };

  const { data: existing } = await supabase.from("project_tasks").select("title").eq("project_id", input.projectId).limit(200);
  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Extracted) },
      system:
        "Tu transformes des comptes rendus (séance client, brief, transcription, cahier des charges) en liste de tâches pour le chantier d'un indépendant suisse. " +
        "Ne garde que ce qui est à faire ; reprends fidèlement les informations du document sans rien inventer. Français, tâches concises.",
      messages: [
        {
          role: "user",
          content: [
            doc,
            {
              type: "text",
              text:
                `Chantier : « ${project.name} ». Date du jour : ${lastDays(1)[0]}.\n` +
                (existing?.length ? `Tâches déjà présentes (ne pas les répéter) :\n${existing.map((t) => `- ${t.title}`).join("\n")}\n` : "") +
                "Extrais les tâches de ce document.",
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ok: false, error: "L'IA n'a pas pu lire ce document." };
    return { ok: true, data: response.parsed_output };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

const bulkSchema = z.object({
  projectId: z.string().uuid(),
  slug: z.string().min(1),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        notes: z.string().trim().max(4000).optional(),
        priority: z.enum(["low", "normal", "high"]),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export async function addTasks(input: z.input<typeof bulkSchema>): Promise<FormState> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "Liste invalide." };
  const { projectId, slug, tasks } = parsed.data;
  if (!(await projectOf(projectId))) return { error: "Chantier introuvable." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("project_tasks").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1).maybeSingle();
  const start = (last?.position ?? 0) + 1;
  const { error } = await supabase.from("project_tasks").insert(
    tasks.map((t, i) => ({ project_id: projectId, title: t.title, notes: t.notes || null, priority: t.priority, due_date: t.due_date, position: start + i })),
  );
  if (error) return { error: "Ajout impossible." };
  refresh(slug);
  return { ok: true };
}
