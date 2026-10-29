import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDatabase } from "../lib/db/client";
import { loadLocalEnv } from "./local-env.mjs";

async function main() {
  loadLocalEnv();
  const base = process.env.TALO_LOCAL_URL ?? "http://127.0.0.1:5175";
  const allowed = new URL(base);
  assert.ok(allowed.hostname === "127.0.0.1" || allowed.hostname === "talo.metropolis-frontend.workers.dev");
  const statePath = ".wrangler/public-auth-check.json";
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {
    accounts: [0, 1].map(() => ({ email: `talo-check-${randomBytes(6).toString("hex")}@example.com`, password: randomBytes(24).toString("base64url"), id: null })),
  };
  const save = () => writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  save();
  const request = async (path: string, body?: unknown, cookie = "", origin = base) => fetch(base + path, {
    method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45_000), redirect: "manual",
  });
  const home = await request("/"); assert.equal(home.status, 200); assert.match(await home.text(), /Every conversation/);
  assert.equal((await request("/api/billing")).status, 401);
  assert.equal((await request("/api/session", { userId: "alex" })).status, 404);
  assert.equal((await request("/api/auth/sign-in/email", {}, "", "https://other.example")).status, 403);
  const sessions: Array<{ cookie: string; caseId: string }> = [];
  for (const account of state.accounts) {
    if (!account.id) {
      const created = await request("/api/auth/sign-up/email", { email: account.email, password: account.password, name: "Synthetic auth check" });
      const data = await created.json() as { user?: { id: string; emailVerified: boolean }; code?: string };
      if (!data.user?.id) { console.log("Signup response:", created.status, data.code ?? "unknown"); throw Error("SIGNUP_FAILED"); }
      account.id = data.user.id; save();
      assert.equal(data.user.emailVerified, false);
      const unverified = await request("/api/auth/sign-in/email", { email: account.email, password: account.password });
      assert.equal(unverified.status, 403);
      // This reserved-domain test account cannot receive mail. Mark only this exact
      // synthetic identity verified to test sessions; this does NOT verify email delivery.
      assert.match(account.email, /^talo-check-[0-9a-f]+@example\.com$/);
      await createDatabase(process.env.DATABASE_URL!).execute(sql`UPDATE neon_auth."user" SET "emailVerified" = true WHERE id = ${account.id} AND email = ${account.email}`);
    }
    const signedIn = await request("/api/auth/sign-in/email", { email: account.email, password: account.password });
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    assert.ok(cookie);
    const session = await request("/api/session", undefined, cookie);
    assert.equal(session.status, 200);
    const profile = await session.json() as { mode: string; user: { caseId: string } };
    assert.equal(profile.mode, "public"); assert.ok(profile.user?.caseId);
    const restored = await request("/api/session", undefined, cookie);
    assert.equal((await restored.json() as typeof profile).user.caseId, profile.user.caseId);
    assert.equal((await request("/api/billing", undefined, cookie)).status, 200);
    sessions.push({ cookie, caseId: profile.user.caseId });
  }
  assert.notEqual(sessions[0].caseId, sessions[1].caseId);
  const denied = await request("/api/support", { caseId: sessions[1].caseId, message: "paid" }, sessions[0].cookie);
  assert.equal(denied.status, 404);
  const own = await request("/api/support", { caseId: sessions[0].caseId, message: "I paid, but access is pending. What should I do?" }, sessions[0].cookie);
  assert.equal(own.status, 200);
  const answer = await own.json() as { generation: string; model: string; answer: string };
  console.log("Own support response:", answer.generation, answer.model);
  assert.equal(answer.generation, "openai");
  assert.equal((await request("/api/auth/sign-out", {}, sessions[0].cookie)).status, 200);
  assert.equal((await request("/api/billing", undefined, sessions[0].cookie)).status, 401);
  assert.equal((await request("/api/billing", undefined, sessions[1].cookie)).status, 200);
  await request("/api/auth/sign-out", {}, sessions[1].cookie);
  console.log("Public auth checks passed: signup, unverified-email rejection, sign-in, restoration, isolated cases, protected API, Luna generation, sign-out and revoked-session rejection. Mail delivery/OTP entry remains a manual check.");
}
main().catch((error) => { if (error?.code === "ERR_ASSERTION") console.error(error.message); console.error("Public auth check failed; credentials and upstream details hidden."); process.exitCode = 1; });
