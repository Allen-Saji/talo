import { NextRequest, NextResponse } from "next/server";
import { managedAuth } from "./lib/public-auth";
import { runtimeConfig } from "./lib/runtime";

// The SDK exchanges Neon's one-time OAuth verifier for same-origin session cookies.
// Normal visits remain public so the sign-in screen never redirects to itself.
export async function middleware(request: NextRequest) {
  if (!request.nextUrl.searchParams.has("neon_auth_session_verifier")) return NextResponse.next();
  const config = runtimeConfig();
  if (!config.TALO_PUBLIC_AUTH) return NextResponse.redirect(new URL("/", request.url));
  try { return await (await managedAuth(config)).middleware({ loginUrl: "/auth/sign-in" })(request); }
  catch { return NextResponse.redirect(new URL("/auth/sign-in", request.url)); }
}
export const config = { matcher: ["/", "/dashboard", "/playground"] };
