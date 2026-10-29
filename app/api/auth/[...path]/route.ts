import { managedAuth } from "../../../../lib/public-auth";
import { runtimeConfig } from "../../../../lib/runtime";
import { ApiError, json, requireSameOrigin } from "../../../../lib/http";

type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  try {
    const config = runtimeConfig();
    if (!config.TALO_PUBLIC_AUTH) return json({ error: { message: "Not found." } }, 404);
    if (request.method !== "GET") requireSameOrigin(request);
    const auth = await managedAuth(config);
    const methods = auth.handler();
    return methods[request.method as keyof typeof methods](request, context);
  } catch (error) { if (error instanceof ApiError) return json({ error: { message: error.message } }, error.status); return json({ error: { message: "Sign-in is temporarily unavailable." } }, 503); }
}
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
