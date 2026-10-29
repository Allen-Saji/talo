import { z } from "zod";
import { demoUsers } from "../../../lib/demo/fixtures";
import { issueSession, requireLocalDemo, sessionCookie } from "../../../lib/auth";
import { api, ApiError, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";

import { ensurePublicWorkspace, publicSession } from "../../../lib/public-auth";

export const GET = api(async (request) => {
  const config = runtimeConfig();
  if (config.TALO_PUBLIC_AUTH) {
    const account = await publicSession(config);
    const user = account?.emailVerified ? await ensurePublicWorkspace(config, account) : null;
    return json({ mode: "public", users: [], user, verificationRequired: Boolean(account && !account.emailVerified) });
  }
  requireLocalDemo(request, config);
  return json({ mode: "fixture", users: demoUsers });
});
export const POST = api(async (request) => {
  requireSameOrigin(request);
  const config = runtimeConfig();
  if (config.TALO_PUBLIC_AUTH) throw new ApiError(404, "NOT_FOUND", "This route is unavailable.");
  const secret = requireLocalDemo(request, config);
  const { userId } = await parseBody(request, z.object({ userId: z.string() }).strict());
  const user = demoUsers.find((item) => item.id === userId);
  if (!user) throw new ApiError(400, "UNKNOWN_USER", "Choose an available demo customer.");
  const token = issueSession(user.id, secret);
  return json({ user, mode: "fixture" }, 200, { "Set-Cookie": sessionCookie(token, new URL(request.url).protocol === "https:") });
});
