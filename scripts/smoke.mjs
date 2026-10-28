import assert from "node:assert/strict";
import { existsSync } from "node:fs";

if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
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
assert.equal(answer.evidence.entitlement.status, "pending");
assert.equal(answer.evidence.memory.persisted, false);
assert.equal(answer.handoff.status, "prepared");
for (const caseId of ["case-sam", "case-jules"]) {
  await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId, message: "Show payment" }) }, 404);
}
await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId: "case-alex", message: "Show payment", tenantId: "fieldwork" }) }, 400);
await check("/api/support", { method: "POST", headers: sessionHeaders, body: JSON.stringify({ caseId: "case-alex", message: "x".repeat(9000) }) }, 413);
const billing = await check("/api/billing", { headers: sessionHeaders }, 200);
assert.equal((await billing.json()).invoiceId, "INV-1042");
await check("/billing", {}, 200);
await check("/api/diagnostics", {}, 401);
const diagnosticHeaders = { ...headers, Authorization: `Bearer ${process.env.DIAGNOSTICS_TOKEN}` };
const imports = await check("/api/diagnostics", { method: "POST", headers: diagnosticHeaders, body: JSON.stringify({ provider: "imports" }) }, 200);
assert.equal((await imports.json()).status, "passed");
console.log(`${checks} Workers HTTP checks passed. No live provider calls or writes were requested.`);
