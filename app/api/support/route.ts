import { z } from "zod";
import { authenticate } from "../../../lib/auth";
import { api, ApiError, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { formatSupportAnswer } from "../../../lib/support";
import { loadOwnedCase } from "../../../lib/db/cases";

export const POST = api(async (request) => {
  requireSameOrigin(request);
  const config = runtimeConfig();
  const principal = authenticate(request, config);
  const input = await parseBody(request, z.object({ caseId: z.string().min(1).max(80), message: z.string().trim().min(1).max(2000) }).strict());
  const { supportCase, storage } = await loadOwnedCase(config, principal, input.caseId);
  if (!supportCase) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  return json(formatSupportAnswer(supportCase, input.message, storage));
});
