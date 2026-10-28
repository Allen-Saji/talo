import { z } from "zod";
import { demoUsers } from "../../../lib/demo/fixtures";
import { issueSession, requireLocalDemo, sessionCookie } from "../../../lib/auth";
import { api, ApiError, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";

export const GET = api(async (request) => {
  requireLocalDemo(request, runtimeConfig());
  return json({ mode: "fixture", users: demoUsers });
});
export const POST = api(async (request) => {
  requireSameOrigin(request);
  const secret = requireLocalDemo(request, runtimeConfig());
  const { userId } = await parseBody(request, z.object({ userId: z.string() }).strict());
  const user = demoUsers.find((item) => item.id === userId);
  if (!user) throw new ApiError(400, "UNKNOWN_USER", "Choose an available demo customer.");
  const token = issueSession(user.id, secret);
  return json({ user, mode: "fixture" }, 200, { "Set-Cookie": sessionCookie(token, new URL(request.url).protocol === "https:") });
});
