"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type BusinessFormState = { error?: string; fieldErrors?: Record<string, string> };

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lettres minuscules, chiffres et tirets uniquement.")
    .min(2, "2 caractères minimum.")
    .max(40),
  description: z.string().trim().max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide."),
  websites: z.string().optional(),
  social: z.string().optional(),
});

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function saveBusiness(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const input = parsed.data;

  const websites = (input.websites ?? "")
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (/^https?:\/\//.test(w) ? w : `https://${w}`));
  for (const w of websites) {
    if (!URL.canParse(w)) return { fieldErrors: { websites: `Adresse invalide : ${w}` } };
  }

  const supabase = await createClient();
  const row = {
    name: input.name,
    slug: input.slug,
    description: input.description || null,
    color: input.color.toLowerCase(),
    websites,
    modules: input.social === "on" ? ["social"] : [],
  };

  let businessId = input.id || null;
  if (businessId) {
    const { error } = await supabase.from("businesses").update(row).eq("id", businessId);
    if (error) return error.code === "23505" ? { fieldErrors: { slug: "Cette adresse est déjà prise." } } : { error: "Enregistrement impossible." };
  } else {
    const { data: last } = await supabase.from("businesses").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("businesses")
      .insert({ ...row, position: (last?.position ?? -1) + 1 })
      .select("id")
      .single();
    if (error) return error.code === "23505" ? { fieldErrors: { slug: "Cette adresse est déjà prise." } } : { error: "Création impossible." };
    businessId = data.id;
    await logActivity(supabase, { business_id: businessId, kind: "business.created", message: `Business « ${row.name} » créé` });
  }

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) return { fieldErrors: { logo: "Format accepté : PNG, JPEG, WebP ou SVG." } };
    if (logo.size > 3 * 1024 * 1024) return { fieldErrors: { logo: "3 Mo maximum." } };
    const ext = logo.type.split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg");
    const path = `${businessId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, logo, { contentType: logo.type });
    if (error) return { error: "Le logo n'a pas pu être envoyé." };
    const { data: previous } = await supabase.from("businesses").select("logo_path").eq("id", businessId).single();
    await supabase.from("businesses").update({ logo_path: path }).eq("id", businessId);
    if (previous?.logo_path) await supabase.storage.from("logos").remove([previous.logo_path]);
  }
  if (formData.get("removeLogo") === "on") {
    const { data: previous } = await supabase.from("businesses").select("logo_path").eq("id", businessId).single();
    if (previous?.logo_path) {
      await supabase.storage.from("logos").remove([previous.logo_path]);
      await supabase.from("businesses").update({ logo_path: null }).eq("id", businessId);
    }
  }

  revalidatePath("/", "layout");
  redirect(`/b/${row.slug}`);
}

export async function setArchived(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const archive = formData.get("archive") === "1";
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .select("name")
    .single();
  if (data) {
    await logActivity(supabase, {
      business_id: id,
      kind: archive ? "business.archived" : "business.restored",
      message: `Business « ${data.name} » ${archive ? "archivé" : "restauré"}`,
    });
  }
  revalidatePath("/", "layout");
}
