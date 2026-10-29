import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { eq, sql } from "drizzle-orm";
import { readLocalEnv } from "./local-env.mjs";
import { readConfig } from "../lib/config";
import { createDatabase } from "../lib/db/client";
import { tenants, users, memberships, supportCases, memoryJobs, lessons } from "../lib/db/schema";
import { enqueueAttempt, recallAttempts, dispatchMemoryJobs } from "../lib/memory/jobs";
import { proposeLesson, reviewLesson, recallLessons } from "../lib/memory/lessons";
import { createMemoryClient } from "../lib/providers/memory";

async function main() {
  const env = parseEnv(readFileSync(".env.memory-schema-check", "utf8"));
  const production = readLocalEnv().DATABASE_URL;
  const host = (url: string) => new URL(url).hostname.replace("-pooler", "");
  assert.ok(env.DATABASE_URL && production && host(env.DATABASE_URL) !== host(production));
  const id = randomUUID();
  const alice = { tenantId: `tenant-${id}`, userId: `alice-${id}` };
  const reviewer = { tenantId: alice.tenantId, userId: `reviewer-${id}` };
  const outsider = { tenantId: `outside-${id}`, userId: `outsider-${id}` };
  const caseId = `case-${id}`;
  const config = readConfig({ ...env, MEMWAL_ACCOUNT_ID: `test-${id}`, MEMWAL_PRIVATE_KEY: "synthetic", TALO_OPERATOR_IDS: reviewer.userId });
  const db = createDatabase(config.DATABASE_URL!);
  await db.batch([
    db.insert(tenants).values([{ id: alice.tenantId, name: "Synthetic" }, { id: outsider.tenantId, name: "Outside" }]),
    db.insert(users).values([alice, reviewer, outsider].map((p) => ({ id: p.userId, name: "Synthetic" }))),
    db.insert(memberships).values([alice, reviewer, outsider]),
    db.insert(supportCases).values({ id: caseId, ...alice, invoiceId: `invoice-${id}`, entitlement: "pending", attempts: [], preference: "Short" }),
  ]);
  const provider = { async submitMemory(_c: unknown, _n: string, event: string) { return `provider-${event}`; }, async memoryStatus(_c: unknown, _n: string, job: string) { return { state: "saved" as const, blobId: `blob-${job}` }; } };
  let recalls = 0;
  const factory = async () => ({ recall: async () => {
    recalls++;
    const rows = await db.select().from(memoryJobs).where(eq(memoryJobs.providerAccountId, config.MEMWAL_ACCOUNT_ID!));
    // Deliberately return other scopes too; authorization must come from the DB.
    return { results: rows.map((row) => ({ blob_id: row.blobId, text: row.content })), total: rows.length };
  } }) as unknown as Awaited<ReturnType<typeof createMemoryClient>>;
  await enqueueAttempt(config, alice, caseId, randomUUID(), "workspace", "not-helped");
  await dispatchMemoryJobs(config, 5, provider);
  await assert.rejects(proposeLesson(config, alice, caseId, "workspace"));
  assert.equal((await recallAttempts(config, alice, caseId, factory))[0]?.outcome, "not-helped");
  assert.deepEqual(await recallAttempts(config, reviewer, caseId, factory), []);
  await enqueueAttempt(config, alice, caseId, randomUUID(), "workspace", "resolved");
  assert.deepEqual(await recallAttempts(config, alice, caseId, factory), [], "newer pending report must hide stale outcome");
  await dispatchMemoryJobs(config, 5, provider);
  assert.equal((await recallAttempts(config, alice, caseId, factory))[0]?.outcome, "resolved");
  const candidate = await proposeLesson(config, alice, caseId, "workspace");
  assert.deepEqual(await recallLessons(config, reviewer, factory), []);
  await assert.rejects(reviewLesson(config, alice, candidate.id, "redact"));
  await assert.rejects(reviewLesson(config, reviewer, candidate.id, "approve"));
  await assert.rejects(reviewLesson(config, { ...reviewer, tenantId: outsider.tenantId }, candidate.id, "redact"));
  await reviewLesson(config, reviewer, candidate.id, "redact");
  await reviewLesson(config, reviewer, candidate.id, "approve");
  assert.deepEqual(await recallLessons(config, reviewer, factory), [], "pending publication is not recallable");
  await dispatchMemoryJobs(config, 5, provider);
  assert.equal((await recallLessons(config, reviewer, factory)).length, 1);
  const count = recalls; assert.deepEqual(await recallLessons(config, outsider, factory), []); assert.equal(recalls, count);
  await reviewLesson(config, reviewer, candidate.id, "retire");
  assert.deepEqual(await recallLessons(config, reviewer, factory), []);
  // Concurrent repeat approval can create only one eligible published job.
  await enqueueAttempt(config, alice, caseId, randomUUID(), "workspace", "resolved");
  await dispatchMemoryJobs(config, 5, provider);
  const next = await proposeLesson(config, alice, caseId, "workspace");
  await reviewLesson(config, reviewer, next.id, "redact");
  const approvals = await Promise.allSettled([reviewLesson(config, reviewer, next.id, "approve"), reviewLesson(config, reviewer, next.id, "approve")]);
  assert.equal(approvals.filter((item) => item.status === "fulfilled").length, 1);
  await dispatchMemoryJobs(config, 5, provider);
  const [published] = await db.select().from(lessons).where(eq(lessons.id, next.id));
  await db.update(memoryJobs).set({ eligible: false }).where(eq(memoryJobs.id, published.sourceJobId));
  assert.deepEqual(await recallLessons(config, reviewer, factory), [], "source suppression revokes shared recall");
  await db.update(memoryJobs).set({ eligible: true }).where(eq(memoryJobs.id, published.sourceJobId));
  assert.equal((await recallLessons(config, reviewer, factory)).length, 1);
  await db.update(lessons).set({ expiresAt: new Date(0) }).where(eq(lessons.id, next.id));
  assert.deepEqual(await recallLessons(config, reviewer, factory), []);
  console.log("Isolated lesson checks passed: scoped attempts, newest report, resolution prerequisite, operator membership, review states, atomic publication, concurrent approval, same-tenant sharing, cross-tenant isolation, retirement, and expiry.");
}
main().catch((error) => { if (error?.code === "ERR_ASSERTION") console.error(error.message); if (error instanceof Error) console.error(error.stack?.split("\n").filter((line) => line.trim().startsWith("at ")).slice(0, 4).join("\n")); console.error("Lesson integration failed; credentials and upstream details hidden."); process.exitCode = 1; });
