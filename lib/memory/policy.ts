import { createHash } from "node:crypto";
import { z } from "zod";
import type { Principal } from "../demo/fixtures";

export const preferences = {
  short: "Keep instructions short.",
  sequential: "Give one step at a time.",
  mobile: "Use mobile instructions.",
} as const;
export const preferenceSchema = z.enum(["short", "sequential", "mobile"]);
export function preferenceContent(preference: keyof typeof preferences) { return `Support preference: ${preferences[preference]}`; }
export function parsePreference(content: string | null) {
  return Object.entries(preferences).find(([key]) => preferenceContent(key as keyof typeof preferences) === content)?.[1];
}
export function memoryNamespace(principal: Principal) {
  return `talo-private-v1-${createHash("sha256").update(JSON.stringify([principal.tenantId, principal.userId])).digest("hex")}`;
}
export function memoryId(principal: Principal, eventId: string) {
  return createHash("sha256").update(JSON.stringify([principal.tenantId, principal.userId, eventId])).digest("hex");
}
