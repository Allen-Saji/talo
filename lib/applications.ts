import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./db/client";
import { applications, memberships } from "./db/schema";
import { ApiError } from "./http";

import { applicationInput } from "./application-input";
export { applicationInput } from "./application-input";
type Owner = { userId: string; tenantId: string };
export async function applicationStore(url: string, owner: Owner) {
  const db = createDatabase(url);
  const [member] = await db.select().from(memberships).where(and(eq(memberships.tenantId, owner.tenantId), eq(memberships.userId, owner.userId))).limit(1);
  if (!member) throw new ApiError(403, "WORKSPACE_REQUIRED", "Your workspace membership is required.");
  return {
    async get() { return (await db.select().from(applications).where(eq(applications.tenantId, owner.tenantId)).limit(1))[0] ?? null; },
    async save(input: z.output<typeof applicationInput>) {
      const { revision, ...fields } = input;
      const rows = revision === 0
        ? await db.insert(applications).values({ id: `app_${randomUUID()}`, tenantId: owner.tenantId, ...fields }).onConflictDoNothing().returning()
        : await db.update(applications).set({ ...fields, revision: revision + 1, updatedAt: new Date() }).where(and(eq(applications.tenantId, owner.tenantId), eq(applications.revision, revision))).returning();
      if (!rows[0]) throw new ApiError(409, "APPLICATION_CHANGED", "This application changed in another tab. Reload before editing again.");
      return rows[0];
    },
  };
}
