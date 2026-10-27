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

const refresh = (slug: string) => {
  revalidatePath(`/b/${slug}/chantiers`, "layout");
  revalidatePath("/chantiers");
  revalidatePath("/");
};

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
  summary: z.string().describe("Ce qui ressort de la séance ou du document, en 2 ou 3 phrases."),
  report: z
    .string()
    .describe(
      "Compte rendu propre en Markdown, uniquement avec ce que contient le document : ## Contexte, ## Décisions, ## Infos clés (budget, délais, contacts, accès, contenus), ## À fournir par le client, ## Questions ouvertes. Omettre une section vide.",
    ),
  tasks: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            "Tâche courte et actionnable, commençant par un verbe (« Intégrer la page Contact »). Pour ce que le client doit fournir : « Obtenir du client : logo en haute définition ».",
          ),
        notes: z.string().describe("Détails utiles tirés du document (contenu demandé, contraintes, qui a dit quoi), ou chaîne vide."),
        priority: z.enum(["low", "normal", "high"]).describe("high : bloquant, urgent ou promis au client à une date."),
        due_date: z.string().nullable().describe("Échéance AAAA-MM-JJ si le document en donne une (même relative : « d'ici vendredi »), sinon null."),
      }),
    )
    .describe("Toutes les actions à faire, dans l'ordre logique de réalisation, sans doublon avec les tâches existantes."),
});

export type ExtractedTasks = z.infer<typeof Extracted>;

const TEXT_TYPES = /\.(txt|md|markdown|csv|json|html?|rtf|srt|vtt)$/i;
const MAX_CHARS = 400_000;

const SYSTEM = `Tu aides Bastien, indépendant suisse (sites web, contenus, conseil), à transformer ses séances et documents en tâches pour un de ses chantiers.
Le document est souvent une transcription automatique brute d'une séance client (TurboScribe, Whisper…) : interlocuteurs « Speaker 1 / Speaker 2 », minutages, hésitations, phrases coupées, fautes de reconnaissance. Ignore le bruit et reconstitue le sens ; Bastien est en général celui qui pose les questions et propose les solutions.

Tâches :
- Ce que Bastien doit faire, ce qu'il a promis, ce qui a été décidé ; une tâche par action concrète, regroupée quand c'est la même action.
- Ce que le client doit fournir ou valider devient « Obtenir du client : … » (logo, textes, photos, accès, validation de maquette…).
- Reprends fidèlement les chiffres, noms, dates, budgets et choix du document. N'invente rien : pas de tâche générique qui n'a pas été évoquée.
- Convertis les échéances relatives (« la semaine prochaine », « avant Noël ») en dates à partir de la date du jour.
Français, style net et professionnel.`;

type Block = { type: "text"; text: string } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

/** Texte d'un fichier texte, quel que soit son encodage courant (UTF-8, UTF-16 avec BOM). */
function decodeText(buffer: Buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return Buffer.from(buffer.subarray(2)).swap16().toString("utf16le");
  return buffer.toString("utf8").replace(/^﻿/, "");
}

async function readDocument(input: { path?: string; name?: string; text?: string }, prefix: string): Promise<Block | string> {
  if (input.text?.trim()) return { type: "text", text: `Document collé :\n"""\n${input.text.slice(0, MAX_CHARS)}\n"""` };
  if (!input.path?.startsWith(prefix)) return "Ajoute un fichier ou colle un texte.";
  const supabase = await createClient();
  const { data: blob } = await supabase.storage.from("project-files").download(input.path);
  if (!blob) return "Fichier introuvable.";
  const name = input.name ?? input.path;
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (/\.pdf$/i.test(name)) return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } };
  if (/\.docx$/i.test(name)) return { type: "text", text: `Document Word « ${name} » :\n"""\n${(await mammoth.extractRawText({ buffer })).value.slice(0, MAX_CHARS)}\n"""` };
  if (TEXT_TYPES.test(name)) return { type: "text", text: `Fichier « ${name} » :\n"""\n${decodeText(buffer).slice(0, MAX_CHARS)}\n"""` };
  return "Format non pris en charge : texte (.txt, .md, .srt…), PDF ou Word (.docx).";
}

/**
 * Lit une transcription de séance, un compte rendu ou un brief (fichier envoyé ou texte collé)
 * et propose les tâches du chantier et un compte rendu propre.
 * Rien n'est créé ici : Bastien valide avant l'ajout.
 */
export async function extractTasks(input: { projectId: string; path?: string; name?: string; text?: string }): Promise<{ ok: true; data: ExtractedTasks } | { ok: false; error: string }> {
  await requireAdmin();
  const anthropic = claude();
  if (!anthropic) return { ok: false, error: NO_KEY };
  const supabase = await createClient();
  const project = await projectOf(input.projectId);
  if (!project) return { ok: false, error: "Chantier introuvable." };
  const doc = await readDocument(input, `${project.id}/`);
  if (typeof doc === "string") return { ok: false, error: doc };

  const [{ data: existing }, { data: business }] = await Promise.all([
    supabase.from("project_tasks").select("title").eq("project_id", project.id).limit(200),
    supabase.from("businesses").select("name, description").eq("id", project.business_id).maybeSingle(),
  ]);
  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 20000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(Extracted) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            doc,
            {
              type: "text",
              text:
                `Business : ${business?.name ?? "?"}${business?.description ? ` (${business.description})` : ""}. Date du jour : ${lastDays(1)[0]}.\n` +
                `Chantier : « ${project.name} ».\n` +
                (existing?.length ? `Tâches déjà présentes (ne pas les répéter) :\n${existing.map((t) => `- ${t.title}`).join("\n")}\n` : "") +
                "Organise ce document en tâches et en compte rendu.",
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

const taskList = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(200),
      notes: z.string().trim().max(4000).optional(),
      priority: z.enum(["low", "normal", "high"]),
      due_date: z
        .string()
        .nullable()
        .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
    }),
  )
  .max(200);

async function insertTasks(projectId: string, tasks: z.output<typeof taskList>) {
  if (!tasks.length) return null;
  const supabase = await createClient();
  const { data: last } = await supabase.from("project_tasks").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1).maybeSingle();
  const start = (last?.position ?? 0) + 1;
  const { error } = await supabase
    .from("project_tasks")
    .insert(tasks.map((t, i) => ({ project_id: projectId, title: t.title, notes: t.notes || null, priority: t.priority, due_date: t.due_date, position: start + i })));
  return error;
}

/** Le compte rendu de l'IA, gardé en fichier Markdown dans le chantier. */
async function saveReport(projectId: string, report: string) {
  if (!report.trim()) return;
  const supabase = await createClient();
  const path = `${projectId}/${randomUUID()}.md`;
  const body = Buffer.from(report, "utf8");
  const { error } = await supabase.storage.from("project-files").upload(path, body, { contentType: "text/markdown; charset=utf-8" });
  if (!error) await supabase.from("project_files").insert({ project_id: projectId, storage_path: path, name: `Compte rendu ${lastDays(1)[0]}.md`, size: body.length, mime: "text/markdown" });
}

const bulkSchema = z.object({ projectId: z.string().uuid(), slug: z.string().min(1), tasks: taskList, report: z.string().max(60_000).optional() });

export async function addTasks(input: z.input<typeof bulkSchema>): Promise<FormState> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "Liste invalide." };
  const { projectId, slug, tasks, report } = parsed.data;
  if (!(await projectOf(projectId))) return { error: "Chantier introuvable." };
  if (await insertTasks(projectId, tasks)) return { error: "Ajout impossible." };
  if (report) await saveReport(projectId, report);
  refresh(slug);
  return { ok: true };
}
