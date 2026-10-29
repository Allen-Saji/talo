import { and, desc, eq, gt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Config } from "../config";
import type { Principal } from "../demo/fixtures";
import { createDatabase } from "../db/client";
import { loadOwnedCase } from "../db/cases";
import { lessons, memoryJobs, memberships } from "../db/schema";
import { ApiError } from "../http";
import { createMemoryClient } from "../providers/memory";
import { lessonContent, lessonNamespace, lessonTemplates, parseAttempt, productVersion } from "./policy";

function database(config: Config) { if (!config.DATABASE_URL) throw new ApiError(503, "LESSONS_UNAVAILABLE", "Lesson storage is unavailable."); return createDatabase(config.DATABASE_URL); }
export function requireOperator(config: Config, principal: Principal) {
  if (!principal.isOperator && !config.TALO_OPERATOR_IDS?.split(",").map((id) => id.trim()).includes(principal.userId)) throw new ApiError(403, "OPERATOR_REQUIRED", "Operator access is required.");
}
async function isMember(config: Config, principal: Principal) {
  return (await database(config).select().from(memberships).where(and(eq(memberships.tenantId, principal.tenantId), eq(memberships.userId, principal.userId))).limit(1)).length === 1;
}
async function requireTenantOperator(config: Config, principal: Principal) {
  requireOperator(config, principal);
  if (!await isMember(config, principal)) throw new ApiError(403, "OPERATOR_REQUIRED", "Operator access is required.");
}
export async function proposeLesson(config: Config, principal: Principal, caseId: string, code: keyof typeof lessonTemplates) {
  if (!(await loadOwnedCase(config, principal, caseId)).supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  const db = database(config);
  const attempts = await db.select().from(memoryJobs).where(and(eq(memoryJobs.tenantId, principal.tenantId), eq(memoryJobs.userId, principal.userId), eq(memoryJobs.caseId, caseId), eq(memoryJobs.kind, "attempt"), eq(memoryJobs.eligible, true), gt(memoryJobs.expiresAt, new Date()))).orderBy(desc(memoryJobs.createdAt));
  const source = attempts.find((job) => { const attempt = parseAttempt(job.content); return attempt?.action === code; });
  if (!source || source.state !== "saved" || parseAttempt(source.content)?.outcome !== "resolved") throw new ApiError(409, "RESOLUTION_REQUIRED", "First save a resolved attempt for this step.");
  const id = `${source.id}-${code}`;
  await db.insert(lessons).values({ id, tenantId: principal.tenantId, sourceCaseId: caseId, sourceJobId: source.id, authorId: principal.userId, code, productVersion, expiresAt: new Date(Date.now() + 30 * 86400_000) }).onConflictDoNothing();
  return { id, state: "candidate", proposedText: lessonContent(code) };
}
export async function listReviewQueue(config: Config, principal: Principal) {
  await requireTenantOperator(config, principal);
  const rows = await database(config).select().from(lessons).where(eq(lessons.tenantId, principal.tenantId)).orderBy(desc(lessons.createdAt)).limit(50);
  return rows.map((row) => ({ id: row.id, state: row.state, productVersion: row.productVersion, expiresAt: row.expiresAt, proposedText: lessonContent(row.code as keyof typeof lessonTemplates) }));
}
export async function reviewLesson(config: Config, principal: Principal, id: string, action: "redact" | "approve" | "retire") {
  await requireTenantOperator(config, principal); const db = database(config);
  const [lesson] = await db.select().from(lessons).where(and(eq(lessons.id, id), eq(lessons.tenantId, principal.tenantId))).limit(1);
  if (!lesson) throw new ApiError(404, "LESSON_NOT_FOUND", "This lesson is unavailable.");
  if (action === "retire") {
    await db.batch([
      db.update(lessons).set({ state: "retired", reviewerId: principal.userId, updatedAt: new Date() }).where(and(eq(lessons.id, id), eq(lessons.tenantId, principal.tenantId))),
      db.update(memoryJobs).set({ eligible: false, updatedAt: new Date() }).where(and(eq(memoryJobs.id, lesson.memoryJobId ?? ""), eq(memoryJobs.tenantId, principal.tenantId))),
    ]); return { state: "retired" };
  }
  if (lesson.expiresAt <= new Date() || lesson.productVersion !== productVersion) throw new ApiError(409, "LESSON_EXPIRED", "This lesson needs a new review.");
  if (action === "redact") {
    const rows = await db.update(lessons).set({ state: "redacted", reviewerId: principal.userId, updatedAt: new Date() }).where(and(eq(lessons.id, id), eq(lessons.state, "candidate"))).returning({ id: lessons.id });
    if (!rows.length) throw new ApiError(409, "INVALID_REVIEW_STATE", "Only candidates can enter redacted review.");
    return { state: "redacted", proposedText: lessonContent(lesson.code as keyof typeof lessonTemplates) };
  }
  if (lesson.state !== "redacted" || !config.MEMWAL_ACCOUNT_ID) throw new ApiError(409, "REVIEW_REQUIRED", "Review the redacted lesson first.");
  const jobId = randomUUID();
  // The same statement checks state and creates the publish job, so a concurrent
  // retirement cannot be overwritten by approval.
  const result = await db.execute(sql`WITH candidate AS MATERIALIZED (
    SELECT l.* FROM lessons l JOIN memory_jobs source ON source.id = l."sourceJobId"
    WHERE l.id = ${id} AND l."tenantId" = ${principal.tenantId}
      AND l.state = 'redacted' AND l."expiresAt" > now() AND l."productVersion" = ${productVersion}
      AND source.eligible = true AND source.state = 'saved' AND source."expiresAt" > now()
      FOR UPDATE OF l, source
  ), retired AS (
    UPDATE lessons SET state = 'retired', "updatedAt" = now() WHERE "tenantId" = ${principal.tenantId}
      AND code = ${lesson.code} AND state = 'approved' AND EXISTS (SELECT 1 FROM candidate)
    RETURNING "memoryJobId"
  ), disabled AS (
    UPDATE memory_jobs SET eligible = false WHERE id IN (SELECT "memoryJobId" FROM retired) RETURNING id
  ), job AS (
    INSERT INTO memory_jobs (id, "tenantId", "userId", "eventId", kind, "caseId", content, "providerAccountId", eligible, "expiresAt", namespace)
    SELECT ${jobId}, "tenantId", "authorId", ${jobId}, 'lesson', "sourceCaseId", ${lessonContent(lesson.code as keyof typeof lessonTemplates)}, ${config.MEMWAL_ACCOUNT_ID}, true, "expiresAt", ${lessonNamespace(principal.tenantId)} FROM candidate WHERE (SELECT count(*) FROM retired) >= 0 AND (SELECT count(*) FROM disabled) >= 0 RETURNING id
  ) UPDATE lessons SET state = 'approved', "reviewerId" = ${principal.userId}, "updatedAt" = now(), "memoryJobId" = ${jobId}
    WHERE id = ${id} AND EXISTS (SELECT 1 FROM job) RETURNING id`);
  if (!result.rows.length) throw new ApiError(409, "INVALID_REVIEW_STATE", "The review state changed. Reload the lesson.");
  return { state: "approved", memoryState: "pending" };
}
export async function recallLessons(config: Config, principal: Principal, clientFactory = createMemoryClient) {
  if (!config.DATABASE_URL || !config.MEMWAL_ACCOUNT_ID || !config.MEMWAL_PRIVATE_KEY) return [];
  if (!await isMember(config, principal)) return [];
  const db = database(config);
  const query = () => db.select({ lesson: lessons, job: memoryJobs }).from(lessons).innerJoin(memoryJobs, eq(memoryJobs.id, lessons.memoryJobId)).where(and(eq(lessons.tenantId, principal.tenantId), eq(memoryJobs.tenantId, principal.tenantId), eq(lessons.state, "approved"), sql`EXISTS (SELECT 1 FROM memory_jobs source WHERE source.id = ${lessons.sourceJobId} AND source.eligible = true AND source.state = 'saved' AND source."expiresAt" > now())`, eq(lessons.productVersion, productVersion), gt(lessons.expiresAt, new Date()), eq(memoryJobs.eligible, true), eq(memoryJobs.state, "saved"), eq(memoryJobs.providerAccountId, config.MEMWAL_ACCOUNT_ID!), gt(memoryJobs.expiresAt, new Date()))).orderBy(desc(lessons.updatedAt)).limit(10);
  const rows = await query(); if (!rows.length) return [];
  const namespace = lessonNamespace(principal.tenantId);
  const client = await clientFactory(config, namespace);
  const recalled = await client.recall({ query: "Reviewed support lessons for missing access", namespace, limit: 20, maxTokens: 2500 });
  const fresh = await query();
  if (!await isMember(config, principal)) return [];
  return rows.filter(({ lesson, job }) => lesson.code in lessonTemplates && job.namespace === namespace && job.content === lessonContent(lesson.code as keyof typeof lessonTemplates) && fresh.some((row) => row.lesson.id === lesson.id && row.job.id === job.id) && recalled.results.some((hit) => hit.blob_id === job.blobId && hit.text === job.content)).map(({ lesson, job }) => ({ id: lesson.id, text: job.content!, source: "walrus" as const }));
}
