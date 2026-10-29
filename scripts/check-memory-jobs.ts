import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { readConfig } from "../lib/config";
import { createDatabase } from "../lib/db/client";
import { memoryJobs } from "../lib/db/schema";
import { enqueuePreference, dispatchMemoryJobs, suppressCaseMemories, recallPreference } from "../lib/memory/jobs";
import { modelDailyUsage } from "../lib/db/schema";
import { readLocalEnv } from "./local-env.mjs";
import { reserveSupportGeneration } from "../lib/providers/openai";

// Explicitly isolated database; this check never calls Walrus or OpenAI.
async function main() {
  const environment = parseEnv(readFileSync(".env.memory-schema-check", "utf8"));
  const production = readLocalEnv().DATABASE_URL;
  const databaseHost = (url: string) => new URL(url).hostname.replace("-pooler", "");
  if (!environment.DATABASE_URL || !production || databaseHost(environment.DATABASE_URL) === databaseHost(production)) throw Error("ISOLATED_DATABASE_REQUIRED");
  const config = readConfig({ ...environment, MEMWAL_ACCOUNT_ID: `synthetic-${randomUUID()}`, MEMWAL_PRIVATE_KEY: "synthetic-test-key", OPENAI_API_KEY: "synthetic-test-key" });
  const db = createDatabase(config.DATABASE_URL!);
  const principal = { tenantId: "studio", userId: "alex" };
  const eventId = randomUUID();
  const job = await enqueuePreference(config, principal, "case-alex", eventId, "short");
  assert.equal((await enqueuePreference(config, principal, "case-alex", eventId, "short")).id, job.id);
  await assert.rejects(enqueuePreference(config, principal, "case-alex", eventId, "mobile"));
  await assert.rejects(enqueuePreference(config, principal, "case-sam", randomUUID(), "short"));
  await assert.rejects(enqueuePreference(config, principal, "case-jules", randomUUID(), "short"));
  let submissions = 0;
  let polls = 0;
  const provider = {
    async submitMemory() { submissions++; await new Promise((r) => setTimeout(r, 50)); return "test-job"; },
    async memoryStatus() { polls++; return polls === 1 ? { state: "submitted" as const } : { state: "saved" as const, blobId: "test-blob" }; },
  };
  await Promise.all([dispatchMemoryJobs(config, 1, provider), dispatchMemoryJobs(config, 1, provider)]);
  assert.equal(submissions, 1, "overlapping dispatch must not submit twice");
  await db.update(memoryJobs).set({ nextAttemptAt: new Date(0) }).where(eq(memoryJobs.id, job.id));
  await dispatchMemoryJobs(config, 1, provider);
  assert.equal(submissions, 1, "resume polls the saved provider job");
  const [saved] = await db.select().from(memoryJobs).where(eq(memoryJobs.id, job.id));
  assert.equal(saved.state, "saved"); assert.equal(saved.blobId, "test-blob");
  await suppressCaseMemories(config, principal, "case-alex");
  assert.equal(await recallPreference(config, principal, "case-alex"), undefined);
  // A crashed lease becomes claimable; ambiguous submissions reuse the same key.
  const crash = await enqueuePreference(config, principal, "case-alex", randomUUID(), "mobile");
  await db.update(memoryJobs).set({ leaseToken: "crashed", leaseUntil: new Date(0) }).where(eq(memoryJobs.id, crash.id));
  const keys: string[] = [];
  let fail = true;
  const uncertain = { async submitMemory(_c: unknown, _n: string, key: string) { keys.push(key); if (fail) { fail = false; throw Error("timeout"); } return "recovered-job"; }, async memoryStatus() { return { state: "saved" as const, blobId: "recovered-blob" }; } };
  await dispatchMemoryJobs(config, 1, uncertain);
  await db.update(memoryJobs).set({ nextAttemptAt: new Date(0) }).where(eq(memoryJobs.id, crash.id));
  await dispatchMemoryJobs(config, 1, uncertain);
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  const [recovered] = await db.select().from(memoryJobs).where(eq(memoryJobs.id, crash.id));
  assert.equal(recovered.state, "saved");
  // Expiry and suppression must block all provider calls.
  const expired = await enqueuePreference(config, principal, "case-alex", randomUUID(), "sequential");
  await db.update(memoryJobs).set({ expiresAt: new Date(0) }).where(eq(memoryJobs.id, expired.id));
  assert.equal((await dispatchMemoryJobs(config, 5, provider)).processed, 0);
  await suppressCaseMemories(config, principal, "case-alex");
  assert.equal((await db.select().from(memoryJobs).where(and(eq(memoryJobs.tenantId, "studio"), eq(memoryJobs.userId, "alex"), eq(memoryJobs.eligible, true)))).length, 0);
  // Concurrent reservations cannot cross the global attempt cap.
  await db.insert(modelDailyUsage).values({ day: new Date().toISOString().slice(0, 10), requests: 0 }).onConflictDoUpdate({ target: modelDailyUsage.day, set: { requests: 0 } });
  const reservations = await Promise.all(Array.from({ length: 25 }, () => reserveSupportGeneration(config)));
  assert.equal(reservations.filter(Boolean).length, 20);
  console.log("Isolated Neon checks passed: ownership, immutable event replay, overlapping dispatch, restart/poll recovery, ambiguous submission retry, suppression, expiry, and concurrent model cap.");
}
main().catch((error) => { console.error(error instanceof Error ? error.stack?.split("\n").filter((line) => line.trim().startsWith("at ")).join("\n") : "Unknown error"); console.error("Error types:", error?.name, error?.cause?.name); if (error?.code === "ERR_ASSERTION") console.error(error.message); console.error("Memory job integration check failed; database and provider details hidden."); process.exitCode = 1; });
