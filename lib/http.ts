import type { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  const merged = new Headers({ "Cache-Control": "no-store", Vary: "Cookie, Authorization" });
  new Headers(headers).forEach((value, name) => merged.set(name, value));
  return Response.json(value, { status, headers: merged });
}
export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
      // Provider errors may contain credentials or customer content. Do not echo them.
      return json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }, 500);
    }
  };
}
export function requireSameOrigin(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    throw new ApiError(403, "ORIGIN_REJECTED", "Use this application's own page.");
  }
}
export async function parseBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 8192): Promise<T> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new ApiError(415, "JSON_REQUIRED", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "BODY_REQUIRED", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "BODY_TOO_LARGE", `Keep requests below ${maxBytes / 1024} KB.`); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, "INVALID_JSON", "The request is not valid JSON."); }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, "INVALID_INPUT", "Check the request fields.");
  return result.data;
}
