"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { downloadLogo, findSiteLogo, LOGO_TYPES, MAX_LOGO, type FoundLogo } from "@/lib/site-logo";
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
  data: z.string().optional(),
  projects: z.string().optional(),
});

function parseWebsites(raw: string) {
  return raw
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (/^https?:\/\//.test(w) ? w : `https://${w}`));
}

export type LogoSearch = { url?: string; site?: string; error?: string };

/** Cherche le logo sur les sites indiqués (dans l'ordre) ; renvoie l'adresse de l'image pour l'aperçu. */
export async function findLogo(websites: string): Promise<LogoSearch> {
  await requireAdmin();
  const sites = parseWebsites(websites).filter((w) => URL.canParse(w));
  if (!sites.length) return { error: "Ajoute d'abord l'adresse d'un site." };
  for (const site of sites.slice(0, 3)) {
    try {
      const logo = await findSiteLogo(site);
      return { url: logo.url, site: new URL(site).hostname };
    } catch {
      // Site suivant.
    }
  }
  return { error: "Aucun logo trouvé sur ces sites : ajoute-le à la main." };
}

export async function saveBusiness(_prev: BusinessFormState, formData: FormData): Promise<BusinessFormState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const input = parsed.data;

  const websites = parseWebsites(input.websites ?? "");
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
    modules: [input.social === "on" && "social", input.data === "on" && "data", input.projects === "on" && "projects"].filter((m): m is string => Boolean(m)),
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

  // Logo : fichier envoyé, sinon image trouvée sur le site (bouton « Trouver »), sinon recherche automatique à la création.
  const logo = formData.get("logo");
  const logoUrl = String(formData.get("logoUrl") ?? "");
  let upload: { body: Blob | Uint8Array; type: string } | null = null;
  if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.includes(logo.type)) return { fieldErrors: { logo: "Format accepté : PNG, JPEG, WebP ou SVG." } };
    if (logo.size > MAX_LOGO) return { fieldErrors: { logo: "3 Mo maximum." } };
    upload = { body: logo, type: logo.type };
  } else if (logoUrl || (!input.id && websites.length)) {
    let found: FoundLogo | null = null;
    try {
      found = logoUrl ? await downloadLogo(logoUrl) : await findSiteLogo(websites[0]);
    } catch {
      if (logoUrl) return { fieldErrors: { logo: "Le logo trouvé n'a pas pu être récupéré : ajoute-le à la main." } };
    }
    if (found) upload = { body: found.bytes, type: found.type };
  }
  if (upload) {
    const ext = upload.type.split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg");
    const path = `${businessId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, upload.body, { contentType: upload.type });
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
