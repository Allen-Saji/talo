import { sql } from "drizzle-orm";
import { jsonb, boolean, integer, index, foreignKey, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", { id: text().primaryKey(), name: text().notNull() });
export const applications = pgTable("applications", {
  id: text().primaryKey(),
  tenantId: text().notNull().references(() => tenants.id).unique(),
  name: text().notNull(),
  origins: text().array().notNull(),
  documentation: text().notNull(),
  widgetEnabled: boolean().notNull().default(false),
  revision: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
export const users = pgTable("users", { id: text().primaryKey(), name: text().notNull() });
export const memberships = pgTable("memberships", {
  tenantId: text().notNull().references(() => tenants.id),
  userId: text().notNull().references(() => users.id),
}, (table) => [primaryKey({ columns: [table.tenantId, table.userId] })]);

export const entitlementState = pgEnum("entitlement_state", ["pending", "active"]);
export const supportCases = pgTable("support_cases", {
  id: text().primaryKey(),
  tenantId: text().notNull(),
  userId: text().notNull(),
  invoiceId: text().notNull(),
  entitlement: entitlementState().notNull(),
  attempts: text().array().notNull(),
  preference: text().notNull(),
}, (table) => [foreignKey({
  columns: [table.tenantId, table.userId],
  foreignColumns: [memberships.tenantId, memberships.userId],
})]);

export const jobState = pgEnum("memory_job_state", ["pending", "submitted", "saved", "failed", "unknown"]);
export const memoryKind = pgEnum("memory_kind", ["preference", "attempt", "lesson"]);
export const memoryJobs = pgTable("memory_jobs", {
  id: text().primaryKey(),
  tenantId: text().notNull().references(() => tenants.id),
  userId: text().notNull().references(() => users.id),
  eventId: text().notNull(),
  kind: memoryKind().notNull().default("preference"),
  caseId: text().references(() => supportCases.id),
  content: text(),
  providerAccountId: text(),
  eligible: boolean().notNull().default(false),
  expiresAt: timestamp({ withTimezone: true }),
  attemptCount: integer().notNull().default(0),
  nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  leaseToken: text(),
  leaseUntil: timestamp({ withTimezone: true }),
  lastError: text(),
  namespace: text().notNull(),
  state: jobState().notNull().default("pending"),
  providerJobId: text(),
  blobId: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("memory_event_scope").on(table.tenantId, table.userId, table.eventId), index("memory_jobs_dispatch").on(table.state, table.nextAttemptAt)]);

export const modelDailyUsage = pgTable("model_daily_usage", {
  day: text().primaryKey(),
  requests: integer().notNull().default(0),
});

export const paymentObservations = pgTable("payment_observations", {
  digest: text().primaryKey(),
  observation: jsonb().notNull(),
  observedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const lessonState = pgEnum("lesson_state", ["candidate", "redacted", "approved", "retired"]);
export const lessons = pgTable("lessons", {
  id: text().primaryKey(), tenantId: text().notNull().references(() => tenants.id),
  sourceCaseId: text().notNull().references(() => supportCases.id),
  sourceJobId: text().notNull().references(() => memoryJobs.id),
  authorId: text().notNull().references(() => users.id), code: text().notNull(),
  productVersion: text().notNull(), state: lessonState().notNull().default("candidate"),
  memoryJobId: text().references(() => memoryJobs.id), reviewerId: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("one_approved_lesson").on(table.tenantId, table.code, table.productVersion).where(sql`${table.state} = 'approved'`)]);
