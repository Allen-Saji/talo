import { api, ApiError, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { publicSession, ensureAccountWorkspace } from "../../../lib/public-auth";
import { publicIdentity } from "../../../lib/identity";
import { applicationInput, applicationStore } from "../../../lib/applications";

async function store() {
  const config = runtimeConfig();
  if (!config.TALO_PUBLIC_AUTH || !config.DATABASE_URL) throw new ApiError(503, "SETUP_UNAVAILABLE", "Application setup is unavailable.");
  const account = await publicSession(config);
  if (!account) throw new ApiError(401, "SIGN_IN_REQUIRED", "Sign in to manage your application.");
  if (!account.emailVerified) throw new ApiError(403, "VERIFY_EMAIL", "Verify your email before creating an application.");
  await ensureAccountWorkspace(config, account);
  return applicationStore(config.DATABASE_URL, publicIdentity(account.id));
}
export const GET = api(async () => json({ application: await (await store()).get() }));
export const PUT = api(async request => {
  requireSameOrigin(request);
  const ownedStore = await store();
  return json({ application: await ownedStore.save(await parseBody(request, applicationInput, 32768)) });
});
