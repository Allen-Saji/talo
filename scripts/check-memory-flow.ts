import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabase } from "../lib/db/client";
import { memoryJobs } from "../lib/db/schema";
import { loadLocalEnv } from "./local-env.mjs";

async function main() {
  loadLocalEnv();
  const base = process.env.TALO_LOCAL_URL ?? "http://127.0.0.1:5175";
  if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error("LOCAL_ONLY");
  const command = process.argv[2];
  if (!["enqueue", "verify", "suppress"].includes(command)) throw Error("Use enqueue, verify, or suppress");
  const statePath = ".wrangler/memory-flow-check.json";
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { eventId: randomUUID() };
  const login = await fetch(`${base}/api/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ userId: "alex" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const post = (path: string, body: unknown, origin = base) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
  if (command === "enqueue") {
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    for (const caseId of ["case-sam", "case-jules"]) assert.equal((await post("/api/memory", { action: "save", caseId, eventId: state.eventId, preference: "sequential" })).status, 404);
    assert.equal((await post("/api/memory", { action: "save", caseId: "case-alex", eventId: state.eventId, preference: "arbitrary transcript" })).status, 400);
    assert.equal((await post("/api/memory", {}, "https://other.example")).status, 403);
    const payload = { action: "save", caseId: "case-alex", eventId: state.eventId, preference: "sequential" };
    const response = await post("/api/memory", payload); assert.equal(response.status, 202);
    const job = await response.json() as { id: string };
    state.jobId = job.id; writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    const replay = await post("/api/memory", payload); assert.equal((await replay.json() as { id: string }).id, job.id);
    console.log("Memory HTTP checks passed: tenant/user isolation, structured content, origin guard, durable enqueue and replay.");
    return;
  }
  if (command === "suppress") {
    assert.equal((await post("/api/memory", { action: "suppress", caseId: "case-alex" })).status, 200);
    const rows = await createDatabase(process.env.DATABASE_URL!).select().from(memoryJobs).where(eq(memoryJobs.id, state.jobId));
    assert.equal(rows[0]?.eligible, false);
    console.log("Application suppression verified; provider record retained."); return;
  }
  const [job] = await createDatabase(process.env.DATABASE_URL!).select().from(memoryJobs).where(eq(memoryJobs.id, state.jobId));
  if (job?.state !== "saved") { console.log(`Memory dispatch: ${job?.state ?? "missing"}; attempts: ${job?.attemptCount ?? 0}.`); process.exitCode = 2; return; }
  const response = await post("/api/support", { caseId: "case-alex", message: "I paid but access is still pending. What should I do next?" });
  assert.equal(response.status, 200);
  const answer = await response.json() as { generation: string; model: string; preference: string; evidence: { memory: { source: string; persisted: boolean } }; answer: string };
  assert.equal(answer.preference, "Give one step at a time.");
  assert.deepEqual(answer.evidence.memory, { source: "walrus", persisted: true });
  assert.equal(answer.generation, "openai"); assert.equal(answer.model, "gpt-6-luna");
  writeFileSync(".wrangler/memory-flow-result.json", JSON.stringify({ state: job.state, generation: answer.generation, model: answer.model, memory: answer.evidence.memory }), { mode: 0o600 });
  console.log("End-to-end passed: durable job saved, scoped Walrus recall, and OpenAI gpt-6-luna answer.");
  console.log(answer.answer);
}
main().catch((error) => { if (error?.code === "ERR_ASSERTION") console.error(error.message); console.error("Memory flow check failed; credentials and upstream details hidden."); process.exitCode = 1; });
