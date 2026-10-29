import { timingSafeEqual } from "node:crypto";
import { observeTransaction } from "../lib/providers/tatum";

type Env = { PROBE_TOKEN: string; TATUM_API_KEY: string; TATUM_TRANSACTION_DIGEST: string };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default {
  async fetch(request: Request, env: Env) {
    const expected = Buffer.from(`Bearer ${env.PROBE_TOKEN ?? ""}`);
    const supplied = Buffer.from(request.headers.get("Authorization") ?? "");
    if (!env.PROBE_TOKEN || env.PROBE_TOKEN.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply({ code: "UNAUTHORIZED" }, 401);
    if (request.method !== "POST" || new URL(request.url).pathname !== "/check") return reply({ code: "NOT_FOUND" }, 404);
    try {
      const details = await observeTransaction(env.TATUM_API_KEY, env.TATUM_TRANSACTION_DIGEST);
      return reply({ provider: "tatum", status: "passed", code: "GRPC_EDGE_READ_OK", runtime: "cloudflare-workers", colo: request.cf?.colo ?? null, details });
    } catch (error) {
      const allowed = ["UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED", "UNAVAILABLE", "UNIMPLEMENTED", "NOT_FOUND", "INTERNAL", "INVALID_DIGEST", "NETWORK_NOT_VERIFIED", "INCOMPLETE_TRANSACTION"];
      const values = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
      const code = [values.code, values.message].find((value): value is string => typeof value === "string" && allowed.includes(value)) ?? "PROVIDER_CHECK_FAILED";
      return reply({ provider: "tatum", status: "failed", code }, 502);
    }
  },
};
