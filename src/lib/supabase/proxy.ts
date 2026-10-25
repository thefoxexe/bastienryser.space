import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hardenCookie, supabaseKey, supabaseUrl } from "./config";

const LOGIN_PATH = "/connexion";
// Pages publiques exigées par TikTok, Google et LinkedIn pour valider les apps de connexion.
const PUBLIC_PATHS = new Set(["/confidentialite", "/conditions"]);

export async function updateSession(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next({ request });
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, hardenCookie(options)),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Ne rien exécuter entre createServerClient et getClaims (recommandation Supabase).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  // Connecté avec le mot de passe, mais le code TOTP reste à saisir.
  let needsSecondFactor = false;
  if (signedIn) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsSecondFactor = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  }

  const onLoginPage = request.nextUrl.pathname === LOGIN_PATH;

  if ((!signedIn || needsSecondFactor) && !onLoginPage) {
    return redirectKeepingCookies(request, response, LOGIN_PATH);
  }
  if (signedIn && !needsSecondFactor && onLoginPage) {
    return redirectKeepingCookies(request, response, "/");
  }

  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === "cache-control") redirect.headers.set(key, value);
  });
  return redirect;
}
