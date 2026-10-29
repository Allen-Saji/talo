import { z } from "zod";
import { authenticateRequest } from "../../../lib/public-auth";
import { api, ApiError, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { formatSupportAnswer } from "../../../lib/support";
import { loadOwnedCase } from "../../../lib/db/cases";

import { recallAttempts, recallPreference } from "../../../lib/memory/jobs";
import { inspectSampleInvoice } from "../../../lib/payments/invoice";
import { recallLessons } from "../../../lib/memory/lessons";
import { generateSupportAnswer, reserveSupportGeneration, supportModel } from "../../../lib/providers/openai";

export const POST = api(async (request) => {
  requireSameOrigin(request);
  const config = runtimeConfig();
  const principal = await authenticateRequest(request, config);
  const input = await parseBody(request, z.object({ caseId: z.string().min(1).max(80), message: z.string().trim().min(1).max(2000) }).strict());
  const { supportCase, storage } = await loadOwnedCase(config, principal, input.caseId);
  if (!supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  const answer = formatSupportAnswer(supportCase, input.message, storage);
  const [payment, preference, attempts, lessons] = await Promise.allSettled([
    inspectSampleInvoice(config, supportCase.invoiceId), recallPreference(config, principal, input.caseId),
    recallAttempts(config, principal, input.caseId), recallLessons(config, principal),
  ]);
  if (payment.status === "fulfilled") answer.evidence.payment = payment.value;
  if (preference.status === "fulfilled" && preference.value) {
    answer.preference = preference.value.preference;
    answer.evidence.memory = { source: "walrus", persisted: true };
  }
  if (attempts.status === "fulfilled" && attempts.value.length) {
    answer.attempts = attempts.value.map((attempt) => attempt.text);
    answer.evidence.history = { source: "walrus", customerReported: true };
  }
  if (lessons.status === "fulfilled") answer.lessons = lessons.value;
  const evidence = answer.evidence.payment;
  const paymentSummary = evidence.source === "tatum" && evidence.invoiceMatch === "match"
    ? "The historical Mainnet transfer matches the sample invoice. This is a replayed demonstration, not proof that you paid Talo."
    : evidence.source === "tatum" ? `The sample invoice match is ${evidence.invoiceMatch}. No payment is credited.`
      : "Live payment evidence is unavailable; the sample invoice has not been verified.";
  answer.answer = `${paymentSummary} Demo app access is ${supportCase.entitlement}. Check billing status, then use the prepared handoff if the issue remains. Avoid repeating attempts already reported below.`;
  answer.handoff.summary = `${supportCase.invoiceId}: ${paymentSummary} Demo app access ${supportCase.entitlement}. Prior attempts: ${answer.attempts.join(" ")} Preference: ${answer.preference} No ticket has been sent.`;
  let generationStage = "reserve";
  try {
    if (await reserveSupportGeneration(config)) {
      generationStage = "generate";
      const generated = await generateSupportAnswer(config, input.message, answer);
      if (generated) { answer.answer = generated.answer; answer.generation = "openai"; answer.model = supportModel; }
    }
  } catch (error) {
    const code = error instanceof Error && /^(MODEL_[A-Z_0-9]+)$/.test(error.message) ? error.message : "MODEL_ATTEMPT_FAILED";
    console.warn(code, generationStage, error instanceof Error && ["TypeError", "TimeoutError", "ZodError", "Error"].includes(error.name) ? error.name : "unknown");
  }
  return json(answer);
});
