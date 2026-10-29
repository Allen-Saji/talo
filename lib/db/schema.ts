import { boolean, integer, index, foreignKey, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", { id: text().primaryKey(), name: text().notNull() });
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
export const memoryJobs = pgTable("memory_jobs", {
  id: text().primaryKey(),
  tenantId: text().notNull().references(() => tenants.id),
  userId: text().notNull().references(() => users.id),
  eventId: text().notNull(),
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
