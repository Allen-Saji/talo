import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";
import { isLocalRequest } from "./config";
import { demoUsers } from "./demo/fixtures";
import { ApiError } from "./http";

const cookieName = "talo_demo_session";
const maxAge = 60 * 60 * 8;
const sessionSchema = z.object({ userId: z.string(), expiresAt: z.number() }).strict();
function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest(); }
export function requireLocalDemo(request: Request, config: Config) {
  if (!config.TALO_DEMO_MODE || !isLocalRequest(request)) throw new ApiError(404, "NOT_FOUND", "This route is unavailable.");
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32) throw new ApiError(503, "SESSION_NOT_CONFIGURED", "Configure a session secret of at least 32 characters.");
  return config.SESSION_SECRET;
}
export function issueSession(userId: string, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: now + maxAge * 1000 })).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}
export function verifySession(token: string, secret: string, now = Date.now()) {
  if (token.length > 1024) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return undefined;
    const [payload, encodedSignature] = parts;
    const expected = signature(payload, secret);
    const supplied = Buffer.from(encodedSignature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return undefined;
    const session = sessionSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (!session.success || session.data.expiresAt <= now) return undefined;
    return demoUsers.find((user) => user.id === session.data.userId);
  } catch { return undefined; }
}
export function sessionCookie(token: string, secure: boolean) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function authenticate(request: Request, config: Config) {
  const secret = requireLocalDemo(request, config);
  const token = request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const user = token ? verifySession(token, secret) : undefined;
  if (!user) throw new ApiError(401, "SIGN_IN_REQUIRED", "Choose a demo customer first.");
  return { userId: user.id, tenantId: user.tenantId };
}
export function requireDiagnostics(request: Request, config: Config) {
  if (!config.TALO_DIAGNOSTICS_ENABLED || !isLocalRequest(request) || !config.DIAGNOSTICS_TOKEN || config.DIAGNOSTICS_TOKEN.length < 32) throw new ApiError(404, "NOT_FOUND", "This route is unavailable.");
  const supplied = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!timingSafeEqual(signature("diagnostics", config.DIAGNOSTICS_TOKEN), signature("diagnostics", supplied))) throw new ApiError(401, "UNAUTHORIZED", "A diagnostic token is required.");
}
