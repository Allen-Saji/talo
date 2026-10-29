import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabase } from "../lib/db/client";
import { memoryJobs } from "../lib/db/schema";
import { loadLocalEnv } from "./local-env.mjs";

async function main() {
  loadLocalEnv();
  const base = "https://talo.metropolis-frontend.workers.dev";
  const command = process.argv[2]; assert.ok(["enqueue", "verify"].includes(command));
  const path = ".wrangler/public-auth-check.json";
  const state = JSON.parse(readFileSync(path, "utf8"));
  const account = state.accounts[0];
  const request = (path: string, body?: unknown, cookie = "") => fetch(base + path, { method: body ? "POST" : "GET", headers: { Origin: base, "Content-Type": "application/json", Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(45_000) });
  const login = await request("/api/auth/sign-in/email", { email: account.email, password: account.password }); assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  try {
    const profile = await (await request("/api/session", undefined, cookie)).json() as { user: { caseId: string } };
    if (command === "enqueue") {
      account.memoryEventId ??= randomUUID();
      writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
      const queued = await request("/api/memory", { action: "save", caseId: profile.user.caseId, eventId: account.memoryEventId, preference: "mobile" }, cookie);
      assert.equal(queued.status, 202);
      account.memoryJobId = (await queued.json() as { id: string }).id;
      writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
      console.log("Public app enqueued a scoped synthetic preference. Waiting for the deployed scheduled Worker."); return;
    }
    const [job] = await createDatabase(process.env.DATABASE_URL!).select().from(memoryJobs).where(eq(memoryJobs.id, account.memoryJobId));
    if (job?.state !== "saved") { console.log(`Scheduled dispatch: ${job?.state ?? "missing"}; attempts: ${job?.attemptCount ?? 0}.`); process.exitCode = 2; return; }
    const response = await request("/api/support", { caseId: profile.user.caseId, message: "I paid but access is pending. What next?" }, cookie); assert.equal(response.status, 200);
    const answer = await response.json() as { generation: string; model: string; preference: string; evidence: { memory: { source: string; persisted: boolean } } };
    assert.equal(answer.generation, "openai"); assert.equal(answer.model, "gpt-6-luna");
    assert.equal(answer.preference, "Use mobile instructions."); assert.deepEqual(answer.evidence.memory, { source: "walrus", persisted: true });
    writeFileSync(".wrangler/public-memory-result.json", JSON.stringify({ state: job.state, attempts: job.attemptCount, generation: answer.generation, memory: answer.evidence.memory }), { mode: 0o600 });
    console.log("Public end-to-end passed: Neon identity, scheduled Workers write/reconciliation, scoped Walrus recall, and OpenAI Luna response.");
  } finally { await request("/api/auth/sign-out", {}, cookie); }
}
main().catch((error) => { if (error?.code === "ERR_ASSERTION") console.error(error.message); console.error("Public memory check failed; credentials hidden."); process.exitCode = 1; });
