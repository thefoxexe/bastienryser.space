import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export type CheckStatus = "ok" | "warning" | "error";
export type Check = { label: string; status: CheckStatus; detail: string; fix?: string };
export type CheckGroup = { title: string; checks: Check[] };

type SystemStatus = {
  cron_jobs: { name: string; schedule: string; active: boolean }[];
  cron_last_runs: Record<string, { status: string; at: string; message: string | null }>;
  vault: { project_url: boolean; cron_secret: boolean };
  admins: number;
};

type Heartbeat = { job: string; last_run_at: string; last_ok: boolean; last_detail: string | null };

const JOBS = [
  { name: "publish-due", label: "Publication automatique", maxAgeMin: 5 },
  { name: "refresh-tokens", label: "Renouvellement des connexions", maxAgeMin: 26 * 60 },
  { name: "fetch-metrics", label: "Récupération des statistiques", maxAgeMin: 26 * 60 },
  { name: "monitor-sites", label: "Surveillance des sites", maxAgeMin: 15 },
  { name: "sync-connectors", label: "Synchronisation des connecteurs", maxAgeMin: 2 * 60 + 10 },
];

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
}

/** Vérifie chaque brique du panel. Ne renvoie jamais la valeur d'un secret, seulement sa présence. */
export async function runSystemChecks(): Promise<CheckGroup[]> {
  const supabase = await createClient();

  const [statusRes, heartbeatsRes, factorsRes, sessionRes] = await Promise.all([
    supabase.rpc("system_status"),
    supabase.from("system_heartbeats").select("job,last_run_at,last_ok,last_detail"),
    supabase.auth.mfa.listFactors(),
    supabase.auth.getSession(),
  ]);

  // Secrets des Edge Functions, via la fonction `health` (oui/non uniquement).
  let health: { secrets: Record<string, boolean> } | null = null;
  let healthError: string | null = null;
  const token = sessionRes.data.session?.access_token;
  if (token) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/health`, {
        headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (res.ok) health = await res.json();
      else healthError = res.status === 404 ? "Fonction non déployée" : `Réponse ${res.status}`;
    } catch {
      healthError = "Injoignable";
    }
  }

  const status = statusRes.data as SystemStatus | null;
  const heartbeats = new Map(((heartbeatsRes.data ?? []) as Heartbeat[]).map((h) => [h.job, h]));
  const secret = (name: string) => health?.secrets[name] === true;

  const database: Check[] = [
    statusRes.error
      ? {
          label: "Schéma de la base",
          status: "error",
          detail: "Le diagnostic ne répond pas.",
          fix: "Appliquer les migrations de supabase/migrations dans l'ordre.",
        }
      : { label: "Schéma de la base", status: "ok", detail: "Tables, règles de sécurité et fonctions en place." },
    {
      label: "Administrateurs",
      status: status && status.admins > 0 ? "ok" : "error",
      detail: status ? `${status.admins} compte(s) autorisé(s).` : "Inconnu.",
    },
  ];

  const cronNames = new Set((status?.cron_jobs ?? []).filter((j) => j.active).map((j) => j.name));
  const automation: Check[] = [
    {
      label: "Secrets du Vault",
      status: status?.vault.project_url && status.vault.cron_secret ? "ok" : "error",
      detail:
        status?.vault.project_url && status.vault.cron_secret
          ? "project_url et cron_secret présents."
          : `Manquant : ${[!status?.vault.project_url && "project_url", !status?.vault.cron_secret && "cron_secret"].filter(Boolean).join(", ")}.`,
      fix: "project_url : select vault.create_secret('https://<ref>.supabase.co', 'project_url'); · cron_secret : réappliquer la migration 20261025000300.",
    },
    ...JOBS.map((job): Check => {
      const hb = heartbeats.get(job.name);
      const run = status?.cron_last_runs[job.name];
      if (!cronNames.has(job.name)) {
        return { label: job.label, status: "error", detail: "Tâche pg_cron absente ou désactivée.", fix: "Appliquer la migration 20261025000200_cron.sql." };
      }
      if (!hb) {
        return {
          label: job.label,
          status: run?.status === "failed" ? "error" : "warning",
          detail: run ? `Pas encore de passage réussi (pg_cron : ${run.status}).` : "Programmée, pas encore exécutée.",
          fix: "Vérifier que la fonction est déployée et que project_url pointe vers ce projet.",
        };
      }
      const late = Date.now() - new Date(hb.last_run_at).getTime() > job.maxAgeMin * 60000;
      return {
        label: job.label,
        status: !hb.last_ok ? "error" : late ? "warning" : "ok",
        detail: `Dernier passage ${ago(hb.last_run_at)}${hb.last_detail ? ` · ${hb.last_detail}` : ""}.`,
        fix: late ? "La tâche ne tourne plus : vérifier pg_cron et que le projet Supabase n'est pas en pause." : undefined,
      };
    }),
  ];

  const functionsCheck: Check = health
    ? { label: "Edge Functions", status: "ok", detail: "Déployées et joignables." }
    : { label: "Edge Functions", status: "error", detail: healthError ?? "Session introuvable.", fix: "supabase functions deploy --project-ref <ref>" };

  const networks: Check[] = [
    functionsCheck,
    {
      label: "Adresse du panel (APP_URL)",
      status: secret("APP_URL") ? "ok" : "warning",
      detail: secret("APP_URL") ? "Configurée." : "Non définie : retour par défaut vers https://bastienryser.space après connexion d'un compte.",
    },
    {
      label: "Meta (Instagram et Facebook)",
      status: secret("META_APP_ID") && secret("META_APP_SECRET") ? "ok" : "warning",
      detail: secret("META_APP_ID") && secret("META_APP_SECRET") ? "Identifiants de l'app présents." : "META_APP_ID / META_APP_SECRET manquants.",
      fix: "Créer l'app sur developers.facebook.com puis ajouter les secrets dans Supabase.",
    },
    {
      label: "LinkedIn (profil)",
      status: secret("LINKEDIN_CLIENT_ID") && secret("LINKEDIN_CLIENT_SECRET") ? "ok" : "warning",
      detail: secret("LINKEDIN_CLIENT_ID") && secret("LINKEDIN_CLIENT_SECRET") ? "Identifiants de l'app présents." : "LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET manquants.",
      fix: "Créer l'app sur linkedin.com/developers puis ajouter les secrets dans Supabase.",
    },
    {
      label: "LinkedIn (page entreprise)",
      status: secret("LINKEDIN_PAGE_CLIENT_ID") || secret("LINKEDIN_CLIENT_ID") ? "ok" : "warning",
      detail: secret("LINKEDIN_PAGE_CLIENT_ID") ? "App dédiée configurée." : "Utilise l'app LinkedIn principale (Community Management API requise).",
    },
  ];

  const verifiedTotp = (factorsRes.data?.totp ?? []).filter((f) => f.status === "verified").length;
  const others: Check[] = [
    {
      label: "Double authentification",
      status: verifiedTotp ? "ok" : "warning",
      detail: verifiedTotp ? "Active sur ton compte." : "Pas encore activée.",
      fix: "Réglages → Double authentification.",
    },
    {
      label: "IA (Claude)",
      status: process.env.ANTHROPIC_API_KEY ? "ok" : "warning",
      detail: process.env.ANTHROPIC_API_KEY ? "Clé configurée côté serveur." : "ANTHROPIC_API_KEY absente : le bouton IA est désactivé.",
      fix: "Ajouter la clé dans Vercel → Settings → Environment Variables, puis redéployer.",
    },
  ];

  return [
    { title: "Base de données", checks: database },
    { title: "Tâches automatiques", checks: automation },
    { title: "Réseaux sociaux", checks: networks },
    { title: "Sécurité et IA", checks: others },
  ];
}
