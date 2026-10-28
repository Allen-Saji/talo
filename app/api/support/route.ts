import { z } from "zod";
import { authenticate } from "../../../lib/auth";
import { api, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { answerSupport } from "../../../lib/support";

export const POST = api(async (request) => {
  requireSameOrigin(request);
  const principal = authenticate(request, runtimeConfig());
  const input = await parseBody(request, z.object({ caseId: z.string().min(1).max(80), message: z.string().trim().min(1).max(2000) }).strict());
  return json(answerSupport(principal, input.caseId, input.message));
});
