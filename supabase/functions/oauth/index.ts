// Flux OAuth officiels : Meta, LinkedIn, Threads, YouTube, TikTok, Pinterest, X et Google (connecteurs de données).
//   GET /oauth/start?state=…     → redirige vers l'écran d'autorisation du réseau
//   GET /oauth/callback?code&state → échange le code, chiffre les tokens dans Vault, revient au panel
// L'état (state) est créé par le panel pour un admin connecté : il protège contre le CSRF
// et n'est utilisable qu'une fois, pendant 10 minutes.

import { ConfigError, env, LINKEDIN_VERSION, META_GRAPH, optionalEnv, SUPABASE_URL } from "../_shared/env.ts";
import { NetworkError } from "../_shared/errors.ts";
import { ConnectorError } from "../_shared/connectors.ts";
import { GOOGLE_SCOPES, listAnalyticsProperties, listSearchConsoleSites, type GoogleKind } from "../_shared/google.ts";
import { inSeconds, upsertAccount } from "../_shared/accounts.ts";
import { metaGet } from "../_shared/meta.ts";
import { PINTEREST_SCOPES, pinterestBoards, pinterestToken, pinterestUser } from "../_shared/pinterest.ts";
import { syncConnector, type ConnectorRow } from "../_shared/sync.ts";
import { adminClient, logActivity, storeToken } from "../_shared/supabase.ts";
import { THREADS_SCOPES, threadsExchange, threadsProfile } from "../_shared/threads.ts";
import { TIKTOK_SCOPES, tiktokToken, tiktokUser } from "../_shared/tiktok.ts";
import { X_SCOPES, xMe, xToken } from "../_shared/x.ts";
import { YOUTUBE_SCOPES, youtubeChannel } from "../_shared/youtube.ts";

type Provider = "meta" | "linkedin" | "linkedin_page" | "google" | "threads" | "youtube" | "tiktok" | "pinterest" | "x";

const LABELS: Record<string, string> = { threads: "Threads", youtube: "YouTube", tiktok: "TikTok", pinterest: "Pinterest", x: "X" };

/** PKCE (X) : vérificateur aléatoire et son empreinte SHA-256 en base64url. */
async function pkce() {
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/oauth/callback`;

const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
];

function linkedinCredentials(provider: Provider) {
  // La « Community Management API » doit être le seul produit de son app LinkedIn :
  // la page peut donc avoir sa propre app (LINKEDIN_PAGE_*), sinon on réutilise la principale.
  if (provider === "linkedin_page" && optionalEnv("LINKEDIN_PAGE_CLIENT_ID")) {
    return { id: env("LINKEDIN_PAGE_CLIENT_ID"), secret: env("LINKEDIN_PAGE_CLIENT_SECRET") };
  }
  return { id: env("LINKEDIN_CLIENT_ID"), secret: env("LINKEDIN_CLIENT_SECRET") };
}

function appUrl() {
  return (optionalEnv("APP_URL") ?? "https://bastienryser.space").replace(/\/$/, "");
}

function backTo(slug: string | null, params: Record<string, string>, page = "reseaux/comptes") {
  const url = new URL(slug ? `${appUrl()}/b/${slug}/${page}` : `${appUrl()}/`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 303);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  const state = url.searchParams.get("state") ?? "";
  const db = adminClient();

  const { data: row } = await db
    .from("oauth_states")
    .select("state, business_id, provider, context, code_verifier, created_at, used_at, businesses(slug, name)")
    .eq("state", state)
    .maybeSingle();
  const business = row?.businesses as unknown as { slug: string; name: string } | undefined;
  const slug = business?.slug ?? null;

  const valid = row && !row.used_at && Date.now() - new Date(row.created_at).getTime() < 10 * 60_000;
  const isGoogle = row?.provider === "google";
  const page = isGoogle ? "donnees/connecteurs" : "reseaux/comptes";
  if (!valid) return backTo(slug, { erreur: "expire" }, page);
  const provider = row.provider as Provider;
  const googleKind = ((row.context as { kind?: string })?.kind === "google_analytics" ? "google_analytics" : "search_console") as GoogleKind;

  try {
    if (action === "start") {
      if (provider === "google") {
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.searchParams.set("client_id", env("GOOGLE_CLIENT_ID"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("scope", GOOGLE_SCOPES[googleKind]);
        // offline + consent : Google renvoie un refresh token pour la synchronisation horaire.
        auth.searchParams.set("access_type", "offline");
        auth.searchParams.set("prompt", "consent");
        auth.searchParams.set("include_granted_scopes", "true");
        auth.searchParams.set("state", state);
        return Response.redirect(auth.toString(), 302);
      }
      if (provider === "youtube") {
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.searchParams.set("client_id", env("GOOGLE_CLIENT_ID"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("scope", YOUTUBE_SCOPES);
        auth.searchParams.set("access_type", "offline");
        auth.searchParams.set("prompt", "consent");
        auth.searchParams.set("state", state);
        return Response.redirect(auth.toString(), 302);
      }
      if (provider === "threads") {
        const auth = new URL("https://threads.net/oauth/authorize");
        auth.searchParams.set("client_id", env("THREADS_APP_ID"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("scope", THREADS_SCOPES);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("state", state);
        return Response.redirect(auth.toString(), 302);
      }
      if (provider === "tiktok") {
        const auth = new URL("https://www.tiktok.com/v2/auth/authorize/");
        auth.searchParams.set("client_key", env("TIKTOK_CLIENT_KEY"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("scope", TIKTOK_SCOPES);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("state", state);
        return Response.redirect(auth.toString(), 302);
      }
      if (provider === "pinterest") {
        const auth = new URL("https://www.pinterest.com/oauth/");
        auth.searchParams.set("client_id", env("PINTEREST_APP_ID"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("scope", PINTEREST_SCOPES);
        auth.searchParams.set("state", state);
        return Response.redirect(auth.toString(), 302);
      }
      if (provider === "x") {
        const { verifier, challenge } = await pkce();
        await db.from("oauth_states").update({ code_verifier: verifier }).eq("state", state);
        const auth = new URL("https://x.com/i/oauth2/authorize");
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("client_id", env("X_CLIENT_ID"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("scope", X_SCOPES);
        auth.searchParams.set("state", state);
        auth.searchParams.set("code_challenge", challenge);
        auth.searchParams.set("code_challenge_method", "S256");
        return Response.redirect(auth.toString(), 302);
      }
      if (provider === "meta") {
        const auth = new URL("https://www.facebook.com/v26.0/dialog/oauth");
        auth.searchParams.set("client_id", env("META_APP_ID"));
        auth.searchParams.set("redirect_uri", REDIRECT_URI);
        auth.searchParams.set("state", state);
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("scope", META_SCOPES.join(","));
        return Response.redirect(auth.toString(), 302);
      }
      const { id } = linkedinCredentials(provider);
      const auth = new URL("https://www.linkedin.com/oauth/v2/authorization");
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("client_id", id);
      auth.searchParams.set("redirect_uri", REDIRECT_URI);
      auth.searchParams.set("state", state);
      auth.searchParams.set(
        "scope",
        provider === "linkedin" ? "openid profile w_member_social" : "w_organization_social r_organization_social rw_organization_admin",
      );
      return Response.redirect(auth.toString(), 302);
    }

    if (action !== "callback") return new Response("Not found", { status: 404 });

    // Usage unique, même si la suite échoue.
    await db.from("oauth_states").update({ used_at: new Date().toISOString() }).eq("state", state).is("used_at", null);

    const code = url.searchParams.get("code");
    if (!code) return backTo(slug, { erreur: "refuse" }, page);

    if (provider === "google") {
      const result = await connectGoogle(db, row.business_id, business!.name, code, googleKind);
      if (result === "none") return backTo(slug, { erreur: "aucun_compte_google" }, page);
      return backTo(slug, { google: result }, page);
    }

    const count =
      provider === "meta"
        ? await connectMeta(db, row.business_id, business!.name, code)
        : provider === "linkedin" || provider === "linkedin_page"
          ? await connectLinkedIn(db, row.business_id, business!.name, code, provider)
          : await connectOther(db, row.business_id, business!.name, code, provider, row.code_verifier);

    if (count === 0) return backTo(slug, { erreur: "aucun_compte" });
    return backTo(slug, { connecte: provider, nombre: String(count) });
  } catch (e) {
    console.error("oauth", e instanceof NetworkError ? e.detail : e);
    return backTo(slug, { erreur: e instanceof ConfigError ? "config" : "echec" }, page);
  }
});

type Db = ReturnType<typeof adminClient>;

// ---------------------------------------------------------------------------
// Meta : jeton utilisateur longue durée → jetons de Page (sans expiration) → comptes IG reliés.
// ---------------------------------------------------------------------------

async function connectMeta(db: Db, businessId: string, businessName: string, code: string) {
  const appId = env("META_APP_ID");
  const appSecret = env("META_APP_SECRET");

  const short = await fetch(
    `${META_GRAPH}/oauth/access_token?` + new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: REDIRECT_URI, code }),
  ).then((r) => r.json());
  if (!short.access_token) throw new NetworkError("Échange du code Meta refusé.", false, true, JSON.stringify(short));

  const long = await fetch(
    `${META_GRAPH}/oauth/access_token?` +
      new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token }),
  ).then((r) => r.json());
  const userToken: string = long.access_token ?? short.access_token;

  type Page = {
    id: string;
    name: string;
    access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
  };
  const pages = await metaGet<{ data: Page[] }>("me/accounts", userToken, {
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: 100,
  });

  // Les jetons de Page n'expirent pas, mais l'accès aux données expire après ~90 jours
  // sans reconnexion : on stocke cette échéance pour prévenir à temps.
  async function dataAccessExpiry(token: string): Promise<string | null> {
    try {
      const res = await fetch(`${META_GRAPH}/debug_token?` + new URLSearchParams({ input_token: token, access_token: `${appId}|${appSecret}` })).then((r) => r.json());
      const d = res.data ?? {};
      const ts = [d.expires_at, d.data_access_expires_at].filter((v: number) => typeof v === "number" && v > 0);
      return ts.length ? new Date(Math.min(...ts) * 1000).toISOString() : null;
    } catch {
      return null;
    }
  }

  let count = 0;
  for (const page of pages.data ?? []) {
    const expires = await dataAccessExpiry(page.access_token);
    const renewed = await upsertAccount(db, {
      business_id: businessId,
      network: "facebook",
      external_id: page.id,
      display_name: page.name,
      avatar_url: page.picture?.data?.url ?? null,
      token: page.access_token,
      token_expires_at: expires,
      meta: { page_id: page.id },
    });
    count++;
    await logActivity(db, {
      business_id: businessId,
      kind: renewed ? "account.refreshed" : "account.connected",
      message: renewed ? `Connexion Facebook renouvelée : ${page.name}` : `Page Facebook connectée : ${page.name} (${businessName})`,
    });

    const ig = page.instagram_business_account;
    if (ig) {
      const renewedIg = await upsertAccount(db, {
        business_id: businessId,
        network: "instagram",
        external_id: ig.id,
        display_name: ig.name || ig.username || page.name,
        username: ig.username ?? null,
        avatar_url: ig.profile_picture_url ?? null,
        token: page.access_token,
        token_expires_at: expires,
        meta: { page_id: page.id },
      });
      count++;
      await logActivity(db, {
        business_id: businessId,
        kind: renewedIg ? "account.refreshed" : "account.connected",
        message: renewedIg ? `Connexion Instagram renouvelée : @${ig.username ?? ig.id}` : `Compte Instagram connecté : @${ig.username ?? ig.id} (${businessName})`,
      });
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// LinkedIn : profil (OpenID) ou pages administrées (Community Management API).
// ---------------------------------------------------------------------------

async function connectLinkedIn(db: Db, businessId: string, businessName: string, code: string, provider: Provider) {
  const creds = linkedinCredentials(provider);
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: creds.id, client_secret: creds.secret }),
  }).then((r) => r.json());
  if (!tokenRes.access_token) throw new NetworkError("Échange du code LinkedIn refusé.", false, true, JSON.stringify(tokenRes));

  const token: string = tokenRes.access_token;
  const expiresAt = tokenRes.expires_in ? new Date(Date.now() + tokenRes.expires_in * 1000).toISOString() : null;
  const refreshToken: string | null = tokenRes.refresh_token ?? null;
  const refreshExpiresAt = tokenRes.refresh_token_expires_in ? new Date(Date.now() + tokenRes.refresh_token_expires_in * 1000).toISOString() : null;

  if (provider === "linkedin") {
    const me = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    if (!me.sub) throw new NetworkError("Profil LinkedIn illisible.", false, true, JSON.stringify(me));
    const renewed = await upsertAccount(db, {
      business_id: businessId,
      network: "linkedin",
      external_id: me.sub,
      display_name: me.name ?? "Profil LinkedIn",
      avatar_url: me.picture ?? null,
      token,
      token_expires_at: expiresAt,
      refresh_token: refreshToken,
      refresh_expires_at: refreshExpiresAt,
      meta: { author: `urn:li:person:${me.sub}` },
    });
    await logActivity(db, {
      business_id: businessId,
      kind: renewed ? "account.refreshed" : "account.connected",
      message: renewed ? `Connexion LinkedIn renouvelée : ${me.name}` : `Profil LinkedIn connecté : ${me.name} (${businessName})`,
    });
    return 1;
  }

  const liHeaders = { Authorization: `Bearer ${token}`, "Linkedin-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" };
  const acls = await fetch("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED", { headers: liHeaders }).then((r) =>
    r.json(),
  );
  let count = 0;
  for (const el of (acls.elements ?? []) as { organization: string }[]) {
    const orgId = el.organization.split(":").pop()!;
    const org = await fetch(`https://api.linkedin.com/rest/organizations/${orgId}`, { headers: liHeaders }).then((r) => r.json());
    const name = org.localizedName ?? `Page ${orgId}`;
    const renewed = await upsertAccount(db, {
      business_id: businessId,
      network: "linkedin_page",
      external_id: orgId,
      display_name: name,
      username: org.vanityName ?? null,
      token,
      token_expires_at: expiresAt,
      refresh_token: refreshToken,
      refresh_expires_at: refreshExpiresAt,
      meta: { author: el.organization },
    });
    count++;
    await logActivity(db, {
      business_id: businessId,
      kind: renewed ? "account.refreshed" : "account.connected",
      message: renewed ? `Connexion LinkedIn renouvelée : ${name}` : `Page LinkedIn connectée : ${name} (${businessName})`,
    });
  }
  return count;
}

// ---------------------------------------------------------------------------
// Google : refresh token chiffré, liste des sites / propriétés, choix automatique quand c'est évident.
// ---------------------------------------------------------------------------

async function connectGoogle(db: Db, businessId: string, businessName: string, code: string, kind: GoogleKind): Promise<"ok" | "choisir" | "none"> {
  const tokens = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
    }),
  }).then((r) => r.json());
  if (!tokens.access_token) throw new NetworkError("Échange du code Google refusé.", false, true, JSON.stringify(tokens));
  if (!tokens.refresh_token) throw new NetworkError("Google n'a pas fourni de jeton durable.", false, true, "refresh_token absent");

  const { data: business } = await db.from("businesses").select("websites").eq("id", businessId).single();
  const hosts = ((business?.websites ?? []) as string[]).map((w) => w.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase());

  let options: { value: string; label: string }[];
  try {
    if (kind === "search_console") {
      const sites = await listSearchConsoleSites(tokens.access_token);
      options = sites.map((s) => ({ value: s, label: s.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "") }));
    } else {
      const props = await listAnalyticsProperties(tokens.access_token);
      options = props.map((p) => ({ value: p.id, label: p.name }));
    }
  } catch (e) {
    throw new NetworkError(e instanceof ConnectorError ? e.message : "Lecture des propriétés Google impossible.", false, true, String(e));
  }
  if (!options.length) return "none";

  // Choix automatique : une seule option, ou une seule qui correspond à un site du business.
  const matching = options.filter((o) => {
    const label = o.label.toLowerCase();
    return kind === "search_console" ? hosts.some((h) => label === h || label === `www.${h}`) : label.includes(businessName.toLowerCase());
  });
  const chosen = options.length === 1 ? options[0] : matching.length === 1 ? matching[0] : null;
  const name = kind === "search_console" ? "Search Console" : "Google Analytics";

  const { data: existing } = await db.from("connectors").select("id, credential_ref").eq("business_id", businessId).eq("kind", kind).maybeSingle();
  const credentialRef = await storeToken(db, tokens.refresh_token, `connector:${kind}:${businessId}`, existing?.credential_ref);
  const row = {
    business_id: businessId,
    kind,
    label: chosen ? `${name} · ${chosen.label}` : name,
    config: { options, ...(chosen ? (kind === "search_console" ? { site_url: chosen.value } : { property_id: chosen.value }) : {}) },
    credential_ref: credentialRef,
    status: chosen ? "connected" : "pending",
    last_error: null,
  };
  const { data: saved } = existing
    ? await db.from("connectors").update(row).eq("id", existing.id).select("id, business_id, kind, label, config, credential_ref, status").single()
    : await db.from("connectors").insert(row).select("id, business_id, kind, label, config, credential_ref, status").single();

  await logActivity(db, {
    business_id: businessId,
    kind: existing ? "connector.refreshed" : "connector.connected",
    message: `${existing ? "Connexion Google renouvelée" : "Connecteur ajouté"} : ${row.label} (${businessName})`,
  });

  if (chosen && saved) await syncConnector(db, saved as ConnectorRow);
  return chosen ? "ok" : "choisir";
}

// ---------------------------------------------------------------------------
// Threads, YouTube, TikTok, Pinterest et X : un compte par connexion.
// ---------------------------------------------------------------------------

async function connectOther(db: Db, businessId: string, businessName: string, code: string, provider: Provider, verifier: string | null) {
  let values: Parameters<typeof upsertAccount>[1];
  const base = { business_id: businessId };

  if (provider === "threads") {
    const { token, expiresIn } = await threadsExchange(code, REDIRECT_URI);
    const me = await threadsProfile(token);
    values = {
      ...base,
      network: "threads",
      external_id: me.id,
      display_name: me.name || me.username || "Threads",
      username: me.username ?? null,
      avatar_url: me.threads_profile_picture_url ?? null,
      token,
      token_expires_at: inSeconds(expiresIn),
    };
  } else if (provider === "youtube") {
    const tokens = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET") }),
    }).then((r) => r.json());
    if (!tokens.access_token || !tokens.refresh_token) throw new NetworkError("Échange du code YouTube refusé.", false, true, JSON.stringify(tokens));
    const channel = await youtubeChannel(tokens.access_token);
    if (!channel) return 0;
    // On garde le refresh token Google : un jeton d'accès est redemandé à chaque usage.
    values = {
      ...base,
      network: "youtube",
      external_id: channel.id,
      display_name: channel.title,
      username: channel.handle,
      avatar_url: channel.avatar,
      token: tokens.refresh_token,
      token_expires_at: null,
    };
  } else if (provider === "tiktok") {
    const t = await tiktokToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI });
    const user = await tiktokUser(t.access_token);
    values = {
      ...base,
      network: "tiktok",
      external_id: t.open_id,
      display_name: user.display_name || user.username || "TikTok",
      username: user.username ?? null,
      avatar_url: user.avatar_url ?? null,
      token: t.access_token,
      token_expires_at: inSeconds(t.expires_in),
      refresh_token: t.refresh_token,
      refresh_expires_at: inSeconds(t.refresh_expires_in),
    };
  } else if (provider === "pinterest") {
    const t = await pinterestToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI });
    const [user, boards] = await Promise.all([pinterestUser(t.access_token), pinterestBoards(t.access_token)]);
    values = {
      ...base,
      network: "pinterest",
      external_id: user.username,
      display_name: user.business_name || user.username,
      username: user.username,
      avatar_url: user.profile_image ?? null,
      token: t.access_token,
      token_expires_at: inSeconds(t.expires_in),
      refresh_token: t.refresh_token ?? null,
      refresh_expires_at: inSeconds(t.refresh_token_expires_in),
      meta: { boards },
    };
  } else if (provider === "x") {
    if (!verifier) throw new NetworkError("Connexion X incomplète, recommence.", false, true, "code_verifier absent");
    const t = await xToken({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier });
    const me = await xMe(t.access_token);
    values = {
      ...base,
      network: "x",
      external_id: me.id,
      display_name: me.name,
      username: me.username,
      avatar_url: me.profile_image_url ?? null,
      token: t.access_token,
      token_expires_at: inSeconds(t.expires_in),
      refresh_token: t.refresh_token ?? null,
    };
  } else {
    return 0;
  }

  const renewed = await upsertAccount(db, values);
  await logActivity(db, {
    business_id: businessId,
    kind: renewed ? "account.refreshed" : "account.connected",
    message: renewed ? `Connexion ${LABELS[provider]} renouvelée : ${values.display_name}` : `Compte ${LABELS[provider]} connecté : ${values.display_name} (${businessName})`,
  });
  return 1;
}
