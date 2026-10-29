import { randomUUID } from "node:crypto";
import { and, eq, gt, desc, sql } from "drizzle-orm";
import type { Config } from "../config";
import { createDatabase } from "../db/client";
import { loadOwnedCase } from "../db/cases";
import { memoryJobs } from "../db/schema";
import type { Principal } from "../demo/fixtures";
import { ApiError } from "../http";
import { createMemoryClient, memoryStatus, submitMemory } from "../providers/memory";
import { memoryId, memoryNamespace, parsePreference, preferenceContent, type preferences } from "./policy";

function database(config: Config) {
  if (!config.DATABASE_URL) throw new ApiError(503, "MEMORY_UNAVAILABLE", "Memory storage is unavailable.");
  return createDatabase(config.DATABASE_URL);
}
const scope = (principal: Principal, caseId: string) => and(eq(memoryJobs.tenantId, principal.tenantId), eq(memoryJobs.userId, principal.userId), eq(memoryJobs.caseId, caseId));
export async function enqueuePreference(config: Config, principal: Principal, caseId: string, eventId: string, preference: keyof typeof preferences) {
  const { supportCase, storage } = await loadOwnedCase(config, principal, caseId);
  if (!supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  if (storage !== "neon" || !config.MEMWAL_ACCOUNT_ID || !config.MEMWAL_PRIVATE_KEY) throw new ApiError(503, "MEMORY_UNAVAILABLE", "Memory storage is unavailable.");
  const db = database(config);
  const id = memoryId(principal, eventId);
  const content = preferenceContent(preference);
  const [existing] = await db.select({ id: memoryJobs.id }).from(memoryJobs).where(eq(memoryJobs.id, id)).limit(1);
  if (!existing) {
    const day = `memory:${new Date().toISOString().slice(0, 10)}`;
    const quota = await db.execute(sql`INSERT INTO model_daily_usage (day, requests) VALUES (${day}, 1)
      ON CONFLICT (day) DO UPDATE SET requests = model_daily_usage.requests + 1
      WHERE model_daily_usage.requests < 50 RETURNING requests`);
    if (!quota.rows.length) throw new ApiError(429, "MEMORY_LIMIT", "The demo's daily memory limit has been reached.");
  }
  await db.insert(memoryJobs).values({ id, ...principal, caseId, eventId, content,
    namespace: memoryNamespace(principal), providerAccountId: config.MEMWAL_ACCOUNT_ID,
    eligible: true, expiresAt: new Date(Date.now() + 30 * 86400_000),
  }).onConflictDoNothing();
  const [job] = await db.select().from(memoryJobs).where(and(eq(memoryJobs.id, id), scope(principal, caseId))).limit(1);
  if (!job || job.content !== content || job.providerAccountId !== config.MEMWAL_ACCOUNT_ID) throw new ApiError(409, "MEMORY_EVENT_CONFLICT", "Use a new event ID for a different preference.");
  return { id: job.id, state: job.state, eligible: job.eligible };
}

export async function suppressCaseMemories(config: Config, principal: Principal, caseId: string) {
  const { supportCase } = await loadOwnedCase(config, principal, caseId);
  if (!supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  await database(config).update(memoryJobs).set({ eligible: false, updatedAt: new Date() }).where(scope(principal, caseId));
}

// Authorization and eligibility are checked again after provider recall. A namespace alone is not an access boundary.
export async function recallPreference(config: Config, principal: Principal, caseId: string) {
  if (!config.DATABASE_URL || !config.MEMWAL_ACCOUNT_ID || !config.MEMWAL_PRIVATE_KEY) return undefined;
  const db = database(config);
  const current = () => db.select().from(memoryJobs).where(and(scope(principal, caseId), eq(memoryJobs.eligible, true), gt(memoryJobs.expiresAt, new Date()), eq(memoryJobs.providerAccountId, config.MEMWAL_ACCOUNT_ID!))).orderBy(desc(memoryJobs.createdAt), desc(memoryJobs.id)).limit(1);
  const [job] = await current();
  // A newer pending preference must not revive an older saved one.
  if (!job || job.state !== "saved" || !job.blobId || !parsePreference(job.content) || job.namespace !== memoryNamespace(principal)) return undefined;
  const { supportCase } = await loadOwnedCase(config, principal, caseId);
  if (!supportCase) return undefined;
  const client = await createMemoryClient(config, job.namespace);
  const recalled = await client.recall({ query: job.content!, namespace: job.namespace, limit: 5, maxTokens: 500 });
  if (!recalled.results.some((item) => item.blob_id === job.blobId && item.text === job.content)) return undefined;
  const [fresh] = await current();
  if (fresh?.id !== job.id || fresh.state !== "saved" || fresh.blobId !== job.blobId) return undefined;
  if (!(await loadOwnedCase(config, principal, caseId)).supportCase) return undefined;
  return { preference: parsePreference(job.content)!, jobId: job.id };
}

export async function dispatchMemoryJobs(config: Config, limit = 5, provider = { submitMemory, memoryStatus }) {
  const db = database(config);
  if (!config.MEMWAL_ACCOUNT_ID || !config.MEMWAL_PRIVATE_KEY) throw new Error("MEMORY_NOT_CONFIGURED");
  let processed = 0;
  for (let i = 0; i < Math.min(Math.max(limit, 0), 5); i++) {
    const token = randomUUID();
    // One statement owns selection and lease acquisition across overlapping invocations.
    const claimed = await db.execute(sql`UPDATE memory_jobs SET "leaseToken" = ${token},
      "leaseUntil" = now() + interval '5 minutes', "attemptCount" = "attemptCount" + 1, "updatedAt" = now()
      WHERE id = (SELECT j.id FROM memory_jobs j JOIN support_cases c ON c.id = j."caseId"
        JOIN memberships m ON m."tenantId" = j."tenantId" AND m."userId" = j."userId"
        WHERE j.state IN ('pending', 'submitted', 'unknown') AND j.eligible = true
          AND c."tenantId" = j."tenantId" AND c."userId" = j."userId"
          AND j."expiresAt" > now() AND j."providerAccountId" = ${config.MEMWAL_ACCOUNT_ID}
          AND j."attemptCount" < 20 AND j."nextAttemptAt" <= now()
          AND (j."leaseUntil" IS NULL OR j."leaseUntil" < now())
        ORDER BY j."nextAttemptAt", j."createdAt" FOR UPDATE OF j SKIP LOCKED LIMIT 1)
      RETURNING id`);
    const id = claimed.rows[0]?.id;
    if (typeof id !== "string") break;
    const [job] = await db.select().from(memoryJobs).where(and(eq(memoryJobs.id, id), eq(memoryJobs.leaseToken, token)));
    if (!job) continue;
    const owned = and(eq(memoryJobs.id, id), eq(memoryJobs.leaseToken, token));
    let providerJobId = job.providerJobId;
    try {
      if (!job.eligible || !job.content || !parsePreference(job.content) || job.namespace !== memoryNamespace(job)) throw new Error("INELIGIBLE_MEMORY");
      if (!providerJobId) {
        // Retrying an unknown submission reuses exactly the same immutable content and key.
        providerJobId = await provider.submitMemory(config, job.namespace, job.id, job.content);
        await db.update(memoryJobs).set({ providerJobId, state: "submitted", updatedAt: new Date() }).where(owned);
      }
      const result = await provider.memoryStatus(config, job.namespace, providerJobId);
      await db.update(memoryJobs).set({ ...result, providerJobId, leaseToken: null, leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + 60_000), updatedAt: new Date(), lastError: job.attemptCount >= 20 && result.state !== "saved" && result.state !== "failed" ? "RETRY_EXHAUSTED" : result.state === "unknown" ? "RECEIPT_UNVERIFIED" : null,
      }).where(owned);
    } catch {
      await db.update(memoryJobs).set({ state: "unknown", providerJobId, lastError: job.attemptCount >= 20 ? "RETRY_EXHAUSTED" : "MEMORY_ATTEMPT_FAILED",
        leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(job.attemptCount, 7)) * 1000), updatedAt: new Date(),
      }).where(owned);
    }
    processed++;
  }
  return { processed };
}
