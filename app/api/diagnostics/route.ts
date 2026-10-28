import { z } from "zod";
import { requireDiagnostics } from "../../../lib/auth";
import { api, json, parseBody, requireSameOrigin } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";
import { configurationStatus, runProbe } from "../../../lib/providers/probes";

export const GET = api(async (request) => {
  const config = runtimeConfig();
  requireDiagnostics(request, config);
  return json({ providers: configurationStatus(config) });
});
export const POST = api(async (request) => {
  const config = runtimeConfig();
  requireDiagnostics(request, config);
  requireSameOrigin(request);
  const { provider } = await parseBody(request, z.object({ provider: z.enum(["imports", "neon", "tatum", "walrus"]) }).strict());
  return json(await runProbe(provider, config));
});
