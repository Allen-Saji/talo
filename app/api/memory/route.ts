import { z } from "zod";
import { authenticateRequest } from "../../../lib/public-auth";
import { api, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { enqueuePreference, suppressCaseMemories } from "../../../lib/memory/jobs";
import { preferenceSchema } from "../../../lib/memory/policy";

export const POST = api(async (request) => {
  requireSameOrigin(request);
  const config = runtimeConfig();
  const principal = await authenticateRequest(request, config);
  const input = await parseBody(request, z.discriminatedUnion("action", [
    z.object({ action: z.literal("save"), caseId: z.string().min(1).max(80), eventId: z.uuid(), preference: preferenceSchema }).strict(),
    z.object({ action: z.literal("suppress"), caseId: z.string().min(1).max(80) }).strict(),
  ]));
  if (input.action === "suppress") {
    await suppressCaseMemories(config, principal, input.caseId);
    return json({ state: "suppressed", providerDeleted: false });
  }
  return json(await enqueuePreference(config, principal, input.caseId, input.eventId, input.preference), 202);
});
