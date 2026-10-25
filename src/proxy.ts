import { NextResponse, type NextRequest } from "next/server";
import { missingConfig, SETUP_PATH } from "@/lib/supabase/config";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Sans Supabase, rien n'est accessible : seule la page qui explique quoi configurer s'affiche.
  if (missingConfig.length) {
    if (request.nextUrl.pathname === SETUP_PATH) return NextResponse.next();
    return NextResponse.redirect(new URL(SETUP_PATH, request.url));
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tout, sauf les fichiers statiques de Next.js, le favicon et robots.txt.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
