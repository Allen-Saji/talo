import type { Config } from "./config";
import { authenticate } from "./auth";
import { ApiError } from "./http";
import { publicIdentity } from "./identity";
import { createDatabase } from "./db/client";
import { tenants, users, memberships, supportCases } from "./db/schema";

export async function managedAuth(config: Config) {
  if (!config.NEON_AUTH_BASE_URL || !config.NEON_AUTH_COOKIE_SECRET || config.NEON_AUTH_COOKIE_SECRET.length < 32) throw new ApiError(503, "AUTH_UNAVAILABLE", "Sign-in is unavailable.");
  const { createNeonAuth } = await import("@neondatabase/auth/next/server");
  return createNeonAuth({ baseUrl: config.NEON_AUTH_BASE_URL, cookies: { secret: config.NEON_AUTH_COOKIE_SECRET, sessionDataTtl: 60 }, logLevel: "silent" });
}
export async function publicSession(config: Config) {
  const auth = await managedAuth(config);
  const result = await auth.getSession({ query: { disableCookieCache: "true" } });
  if (result.error) throw new ApiError(503, "AUTH_UNAVAILABLE", "Sign-in is unavailable.");
  return result.data?.user;
}
export async function authenticateRequest(request: Request, config: Config) {
  if (!config.TALO_PUBLIC_AUTH) return authenticate(request, config);
  const user = await publicSession(config);
  if (!user) throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to use your support case.");
  if (!user.emailVerified) throw new ApiError(403, "VERIFY_EMAIL", "Verify your email before using support.");
  return publicIdentity(user.id);
}
export async function ensurePublicWorkspace(config: Config, user: { id: string; name: string; emailVerified: boolean }) {
  if (!user.emailVerified) throw new ApiError(403, "VERIFY_EMAIL", "Verify your email before using support.");
  if (!config.DATABASE_URL) throw new ApiError(503, "STORAGE_UNAVAILABLE", "Case storage is unavailable.");
  const identity = publicIdentity(user.id);
  const db = createDatabase(config.DATABASE_URL);
  await db.batch([
    db.insert(tenants).values({ id: identity.tenantId, name: "Your demo workspace" }).onConflictDoNothing(),
    db.insert(users).values({ id: identity.userId, name: user.name.slice(0, 100) || "Customer" }).onConflictDoNothing(),
    db.insert(memberships).values({ tenantId: identity.tenantId, userId: identity.userId }).onConflictDoNothing(),
    db.insert(supportCases).values({ id: identity.caseId, tenantId: identity.tenantId, userId: identity.userId,
      invoiceId: identity.invoiceId, entitlement: "pending", attempts: ["Refreshing the page did not restore access."], preference: "Keep instructions short.",
    }).onConflictDoNothing(),
  ]);
  return { id: identity.userId, name: user.name.slice(0, 100) || "Customer", tenantId: identity.tenantId, tenantName: "Your demo workspace", caseId: identity.caseId };
}
