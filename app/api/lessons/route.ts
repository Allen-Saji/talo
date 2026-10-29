import { z } from "zod";
import { authenticateRequest } from "../../../lib/public-auth";
import { api, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { listReviewQueue, proposeLesson, reviewLesson } from "../../../lib/memory/lessons";
import { lessonCodeSchema } from "../../../lib/memory/policy";
export const GET = api(async (request) => {
  const config = runtimeConfig();
  return json({ lessons: await listReviewQueue(config, await authenticateRequest(request, config)) });
});
export const POST = api(async (request) => {
  requireSameOrigin(request); const config = runtimeConfig(); const principal = await authenticateRequest(request, config);
  const input = await parseBody(request, z.discriminatedUnion("action", [
    z.object({ action: z.literal("propose"), caseId: z.string().min(1).max(80), code: lessonCodeSchema }).strict(),
    z.object({ action: z.enum(["redact", "approve", "retire"]), id: z.string().min(1).max(100) }).strict(),
  ]));
  if (input.action === "propose") return json(await proposeLesson(config, principal, input.caseId, input.code), 202);
  return json(await reviewLesson(config, principal, input.id, input.action));
});
