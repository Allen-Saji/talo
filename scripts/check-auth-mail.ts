import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";

// Use an explicitly approved plus-address for a disposable test account. Never
// reset the owner's normal account, and never print passwords or email codes.
async function main() {
  const command = process.argv[2];
  assert.ok(["start", "resend", "verify", "reset-request", "reset-complete"].includes(command));
  const path = ".wrangler/auth-delivery-check.json";
  const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { email: process.env.TALO_AUTH_TEST_EMAIL, password: randomBytes(24).toString("base64url"), stage: "new" };
  assert.match(state.email ?? "", /^[^@]+\+talo-auth-[a-z0-9-]+@[^@]+$/);
  const save = () => writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
  const base = "https://talo.metropolis-frontend.workers.dev";
  const post = async (path: string, body: unknown) => {
    const result = await fetch(base + path, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (!result.ok) { const error = await result.clone().json().catch(() => ({})) as { code?: string }; console.error("Mail endpoint failed:", path, result.status, /^[A-Z_]+$/.test(error.code ?? "") ? error.code : "unavailable"); }
    return result;
  };
  if (command === "start") {
    if (state.stage !== "new") { console.log("Test account already started; awaiting the next explicit step."); return; }
    save();
    const result = await post("/api/auth/sign-up/email", { email: state.email, password: state.password, name: "Talo email delivery check" });
    assert.equal(result.status, 200); state.stage = "awaiting-verification"; save();
    console.log("Verification message requested for the approved test alias. Waiting for its code."); return;
  }
  if (command === "resend") {
    assert.equal(state.stage, "awaiting-verification");
    const result = await post("/api/auth/email-otp/send-verification-otp", { email: state.email, type: "email-verification" });
    assert.equal(result.status, 200); console.log("Fresh verification message requested for the approved test alias."); return;
  }
  if (command === "reset-request") {
    assert.equal(state.stage, "verified");
    const result = await post("/api/auth/email-otp/send-verification-otp", { email: state.email, type: "forget-password" });
    assert.equal(result.status, 200); state.stage = "awaiting-reset"; save();
    console.log("Reset message requested for the disposable test account. Waiting for its code."); return;
  }
  assert.equal(state.stage, command === "verify" ? "awaiting-verification" : "awaiting-reset");
  const codePath = ".wrangler/auth-check-code.txt";
  let otp = existsSync(codePath) ? readFileSync(codePath, "utf8").trim() : "";
  if (!otp) {
    const reader = createInterface({ input: process.stdin, terminal: false });
    otp = (await reader.question("")).trim(); reader.close();
  } assert.match(otp, /^\d{6}$/);
  if (command === "verify") {
    const result = await post("/api/auth/email-otp/verify-email", { email: state.email, otp }); assert.equal(result.status, 200);
  } else {
    state.nextPassword ??= randomBytes(24).toString("base64url"); save();
    const result = await post("/api/auth/email-otp/reset-password", { email: state.email, otp, password: state.nextPassword }); assert.equal(result.status, 200);
    state.password = state.nextPassword; state.nextPassword = undefined;
  }
  const login = await post("/api/auth/sign-in/email", { email: state.email, password: state.password }); assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
  const session = await fetch(base + "/api/session", { headers: { Cookie: cookies } }); assert.equal(session.status, 200);
  assert.ok((await session.json() as { user: unknown }).user);
  await fetch(base + "/api/auth/sign-out", { method: "POST", headers: { Origin: base, Cookie: cookies, "Content-Type": "application/json" }, body: "{}" });
  if (existsSync(codePath)) writeFileSync(codePath, "", { mode: 0o600 });
  state.stage = command === "verify" ? "verified" : "reset-verified"; save();
  console.log(command === "verify" ? "Email verification and verified-session access passed." : "Password reset and new-password sign-in passed.");
}
main().catch((error) => { if (error?.code === "ERR_ASSERTION") console.error(error.message); console.error("Mail-flow check failed; credentials and codes hidden."); process.exitCode = 1; });
