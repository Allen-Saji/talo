import { and, eq } from "drizzle-orm";
import type { Config } from "../config";
import { findOwnedCase, type Principal, type SupportCase } from "../demo/fixtures";
import { createDatabase } from "./client";
import { supportCases } from "./schema";

export async function loadOwnedCase(config: Config, principal: Principal, caseId: string): Promise<{ supportCase: SupportCase | undefined; storage: "fixture" | "neon" }> {
  if (!config.DATABASE_URL) return { supportCase: findOwnedCase(principal, caseId), storage: "fixture" };
  const db = createDatabase(config.DATABASE_URL);
  // Both scope values come from the verified server-side session.
  // Configured database failures propagate; they never fall back to fixtures.
  const [row] = await db.select().from(supportCases).where(and(
    eq(supportCases.id, caseId), eq(supportCases.tenantId, principal.tenantId), eq(supportCases.userId, principal.userId),
  )).limit(1);
  return {
    storage: "neon",
    supportCase: row && {
      id: row.id, owner: { userId: row.userId, tenantId: row.tenantId }, invoiceId: row.invoiceId,
      entitlement: row.entitlement, attempts: row.attempts, preference: row.preference,
    },
  };
}
