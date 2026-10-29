import { createHash } from "node:crypto";
export function publicIdentity(authUserId: string) {
  const suffix = createHash("sha256").update(`neon:${authUserId}`).digest("hex");
  return { userId: `user-${suffix}`, tenantId: `tenant-${suffix}`, caseId: `case-${suffix}`, invoiceId: `DEMO-${suffix.slice(0, 12)}` };
}
