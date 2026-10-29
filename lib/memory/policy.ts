import { attemptLabels } from "./content";
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

export const productVersion = "checkout-demo-v1";
export const attemptActions = attemptLabels;
export const attemptSchema = z.enum(["refresh", "signin", "browser", "workspace", "mobile"]);
export const outcomeSchema = z.enum(["not-helped", "resolved"]);
export type AttemptAction = keyof typeof attemptActions;
export type AttemptOutcome = z.infer<typeof outcomeSchema>;
export function attemptContent(action: AttemptAction, outcome: AttemptOutcome) {
  return `Customer-reported attempt: ${attemptActions[action]}. Reported outcome: ${outcome === "resolved" ? "resolved the issue" : "did not resolve the issue"}. Product: ${productVersion}.`;
}
export function parseAttempt(content: string | null) {
  for (const action of Object.keys(attemptActions) as AttemptAction[]) for (const outcome of ["not-helped", "resolved"] as const) {
    if (content === attemptContent(action, outcome)) return { action, outcome, text: content };
  }
}
export const lessonTemplates = {
  workspace: "When access appears missing, check whether the customer selected the entitled workspace. If they already tried this without success, prepare a handoff instead of repeating it. This does not establish payment or entitlement.",
  mobile: "For a mobile access issue, reopening the app may refresh displayed state. Skip this step if the customer already reported it failed, and check current billing before escalating. This does not establish payment or entitlement.",
} as const;
export const lessonCodeSchema = z.enum(["workspace", "mobile"]);
export function lessonContent(code: keyof typeof lessonTemplates) { return `Reviewed support lesson (${productVersion}): ${lessonTemplates[code]}`; }
export function lessonNamespace(tenantId: string) { return `talo-lessons-v1-${createHash("sha256").update(tenantId).digest("hex")}`; }
export function validMemoryContent(kind: string, content: string | null) {
  if (kind === "preference") return Boolean(parsePreference(content));
  if (kind === "attempt") return Boolean(parseAttempt(content));
  return kind === "lesson" && Object.keys(lessonTemplates).some((code) => lessonContent(code as keyof typeof lessonTemplates) === content);
}
