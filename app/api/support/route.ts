import { z } from "zod";
import { authenticateRequest } from "../../../lib/public-auth";
import { api, ApiError, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { formatSupportAnswer } from "../../../lib/support";
import { loadOwnedCase } from "../../../lib/db/cases";

import { recallPreference } from "../../../lib/memory/jobs";
import { generateSupportAnswer, reserveSupportGeneration, supportModel } from "../../../lib/providers/openai";

export const POST = api(async (request) => {
  requireSameOrigin(request);
  const config = runtimeConfig();
  const principal = await authenticateRequest(request, config);
  const input = await parseBody(request, z.object({ caseId: z.string().min(1).max(80), message: z.string().trim().min(1).max(2000) }).strict());
  const { supportCase, storage } = await loadOwnedCase(config, principal, input.caseId);
  if (!supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  const answer = formatSupportAnswer(supportCase, input.message, storage);
  try {
    const memory = await recallPreference(config, principal, input.caseId);
    if (memory) {
      answer.preference = memory.preference;
      answer.evidence.memory = { source: "walrus", persisted: true };
      answer.handoff.summary = `${supportCase.invoiceId}: synthetic case, app access ${supportCase.entitlement}. Previous attempts: ${supportCase.attempts.join(" ")} Preference: ${memory.preference} No ticket has been sent.`;
    }
  } catch { /* Provider unavailability preserves the labeled fixture context. */ }
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
