import type { Principal, SupportCase } from "./demo/fixtures";
import { findOwnedCase } from "./demo/fixtures";
import { ApiError } from "./http";

export function answerSupport(principal: Principal, caseId: string, question: string) {
  const supportCase = findOwnedCase(principal, caseId);
  if (!supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  return formatSupportAnswer(supportCase, question, "fixture");
}

export function formatSupportAnswer(supportCase: SupportCase, question: string, storage: "fixture" | "neon") {
  const relevant = /pay|paid|access|invoice|billing|subscription/i.test(question);
  return {
    mode: "fixture" as const, storage, caseId: supportCase.id,
    answer: !relevant
      ? "This local version can investigate the demo payment and access case. Ask about your invoice or missing access."
      : supportCase.entitlement === "pending"
        ? "The demo payment matches your invoice, but access is still pending in the app. You have already tried the steps below. Check billing status, then share the prepared summary with support if access remains pending."
        : "Your demo access is active. Open billing status to check the entitled workspace. Your previous case was resolved by switching workspaces.",
    attempts: [...supportCase.attempts], preference: supportCase.preference,
    evidence: {
      payment: { source: "fixture", execution: "success", invoiceMatch: "match", invoiceId: supportCase.invoiceId },
      entitlement: { source: "fixture", status: supportCase.entitlement },
      memory: { source: "fixture", persisted: false },
    },
    route: { id: "billing-status", href: "/billing", label: "Check billing status" },
    handoff: {
      status: "prepared",
      summary: `${supportCase.invoiceId}: demo payment matches; app access ${supportCase.entitlement}. Previous attempts: ${supportCase.attempts.join(" ")} Preference: ${supportCase.preference} No ticket has been sent.`,
    },
  };
}
export type SupportAnswer = ReturnType<typeof answerSupport>;
