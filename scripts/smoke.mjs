import assert from "node:assert/strict";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv();
const neon = process.argv.includes("--neon");
const origin = process.env.TALO_LOCAL_URL ?? "http://localhost:5173";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname));
const headers = { Origin: new URL(origin).origin, "Content-Type": "application/json" };
let checks = 0;
async function check(path, options, expected) {
  const response = await fetch(`${origin}${path}`, options);
  assert.equal(response.status, expected, `${path}: HTTP ${response.status}, expected ${expected}`);
  checks += 1;
  return response;
}

const page = await check("/", {}, 200);
assert.match(await page.text(), /Pick up where you left off/);
await check("/api/hello", {}, 200);
await check("/api/support", { method: "POST", headers, body: JSON.stringify({ caseId: "case-alex", message: "I paid" }) }, 401);
await check("/api/session", { method: "POST", headers: { ...headers, Origin: "https://outside.example" }, body: JSON.stringify({ userId: "alex" }) }, 403);
const login = await check("/api/session", { method: "POST", headers, body: JSON.stringify({ userId: "alex" }) }, 200);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
assert.match(login.headers.get("set-cookie"), /HttpOnly/);
const sessionHeaders = { ...headers, Cookie: cookie };
const support = await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId: "case-alex", message: "I paid but access is missing" }) }, 200);
assert.equal(support.headers.get("Cache-Control"), "no-store");
const answer = await support.json();
assert.equal(answer.mode, "fixture");
if (neon) assert.equal(answer.storage, "neon");
assert.equal(answer.evidence.entitlement.status, "pending");
assert.equal(answer.evidence.memory.persisted, false);
assert.equal(answer.handoff.status, "prepared");
for (const caseId of ["case-sam", "case-jules"]) {
  await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId, message: "Show payment" }) }, 404);
}
await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId: "case-alex", message: "Show payment", tenantId: "fieldwork" }) }, 400);
await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId: "case-alex", message: "x".repeat(9000) }) }, 413);
const billing = await check("/api/billing", { headers: sessionHeaders }, 200);
const invoice = await billing.json();
assert.equal(invoice.invoiceId, "INV-1042");
if (neon) assert.equal(invoice.storage, "neon");
await check("/billing", {}, 200);
await check("/api/diagnostics", {}, 401);
const diagnosticHeaders = { ...headers, Authorization: `Bearer ${process.env.DIAGNOSTICS_TOKEN}` };
const imports = await check("/api/diagnostics", { method: "POST", headers: diagnosticHeaders, body: JSON.stringify({ provider: "imports" }) }, 200);
assert.equal((await imports.json()).status, "passed");
if (neon) {
  const database = await check("/api/diagnostics", { method: "POST", headers: diagnosticHeaders, body: JSON.stringify({ provider: "neon" }) }, 200);
  assert.deepEqual(await database.json(), { provider: "neon", status: "passed", code: "READ_ONLY_BATCH_OK" });
  const sam = await check("/api/session", { method: "POST", headers, body: JSON.stringify({ userId: "sam" }) }, 200);
  const samHeaders = { ...headers, Cookie: sam.headers.get("set-cookie").split(";")[0] };
  const samBilling = await check("/api/billing", { headers: samHeaders }, 200);
  assert.deepEqual(await samBilling.json(), { invoiceId: "INV-1043", entitlement: "active", mode: "fixture", storage: "neon" });
  await check("/api/support", { method: "POST", headers: samHeaders, body: JSON.stringify({ caseId: "case-alex", message: "Show payment" }) }, 404);
}
console.log(`${checks} Workers HTTP checks passed. ${neon ? "Neon-backed support, billing, and user/tenant isolation verified." : "Live Neon reads may occur when configured; Tatum and Walrus were not called."}`);
