import { timingSafeEqual } from "node:crypto";
import { readConfig } from "../lib/config";
import { createMemoryClient, memoryProbeNamespace, memoryProbeText, probeMemoryStatus, submitProbeMemory } from "../lib/providers/memory";

type Env = Record<string, string>;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export default {
  async fetch(request: Request, env: Env) {
    const expected = Buffer.from(`Bearer ${env.PROBE_TOKEN ?? ""}`);
    const supplied = Buffer.from(request.headers.get("Authorization") ?? "");
    if (!env.PROBE_TOKEN || env.PROBE_TOKEN.length < 32 || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return reply({ code: "UNAUTHORIZED" }, 401);
    const path = new URL(request.url).pathname;
    if (request.method !== "POST" || !["/write", "/verify"].includes(path)) return reply({ code: "NOT_FOUND" }, 404);
    try {
      if (!env.PROBE_JOB_ID || !env.PROBE_BLOB_ID) throw new Error("PROBE_REFERENCE_REQUIRED");
      const config = readConfig(env);
      if (path === "/write") {
        const result = await submitProbeMemory(config, "talo-compatibility-setup-v1", memoryProbeText);
        if (result.providerJobId !== env.PROBE_JOB_ID) throw new Error("PROBE_JOB_MISMATCH");
        return reply({ code: "WORKERS_IDEMPOTENT_WRITE_OK", runtime: "cloudflare-workers", colo: request.cf?.colo ?? null });
      }
      const result = await probeMemoryStatus(config, env.PROBE_JOB_ID);
      if (result.state !== "saved" || result.blobId !== env.PROBE_BLOB_ID) throw new Error("PROBE_NOT_SAVED");
      const client = await createMemoryClient(config);
      const recalled = await client.recall({ query: memoryProbeText, namespace: memoryProbeNamespace, limit: 5, maxTokens: 500 });
      if (!recalled.results.some((item) => item.blob_id === env.PROBE_BLOB_ID && item.text === memoryProbeText)) throw new Error("PROBE_NOT_RECALLED");
      return reply({ code: "WORKERS_RECALL_OK", runtime: "cloudflare-workers", colo: request.cf?.colo ?? null });
    } catch { return reply({ code: "MEMORY_PROBE_FAILED" }, 502); }
  },
};
