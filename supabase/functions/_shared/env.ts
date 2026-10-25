export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ConfigError(name);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

export class ConfigError extends Error {
  constructor(public variable: string) {
    super(`Variable manquante : ${variable}`);
  }
}

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

/** Clé secrète (contourne la RLS) : uniquement dans les edge functions. */
export function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

export function publishableKey(): string {
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return env("SUPABASE_ANON_KEY");
}

export const META_GRAPH = "https://graph.facebook.com/v26.0";
export const LINKEDIN_VERSION = "202609";
