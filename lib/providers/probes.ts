import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config";

export type ProbeName = "imports" | "neon" | "tatum" | "walrus";
type ProbeResult = { provider: ProbeName; status: "passed" | "missing_configuration" | "failed"; code: string; details?: Record<string, unknown> };
const requirements: Record<ProbeName, (keyof Config)[]> = {
  imports: [], neon: ["DATABASE_URL"], tatum: ["TATUM_API_KEY", "TATUM_TRANSACTION_DIGEST"], walrus: ["MEMWAL_PRIVATE_KEY", "MEMWAL_ACCOUNT_ID"],
};
export function configurationStatus(config: Config) {
  return Object.entries(requirements).map(([provider, keys]) => ({
    provider, configured: keys.every((key) => Boolean(config[key])),
    missing: keys.filter((key) => !config[key]),
  }));
}

function failureCode(error: unknown): string {
  // Only stable allowlisted codes are returned; upstream messages can contain secrets.
  const allowed = ["UNAUTHENTICATED", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED", "UNAVAILABLE", "UNIMPLEMENTED", "NOT_FOUND", "INVALID_DIGEST", "NETWORK_NOT_VERIFIED", "INCOMPLETE_TRANSACTION"];
  const parsed = z.object({ code: z.unknown().optional(), message: z.unknown().optional() }).safeParse(error);
  if (parsed.success) {
    for (const field of ["code", "message"] as const) {
      const value = parsed.data[field];
      if (typeof value === "string" && allowed.includes(value)) return value;
    }
  }
  return "PROVIDER_CHECK_FAILED";
}

export async function runProbe(provider: ProbeName, config: Config): Promise<ProbeResult> {
  if (requirements[provider].some((key) => !config[key])) return { provider, status: "missing_configuration", code: "CREDENTIALS_OR_INPUT_MISSING" };
  try {
    if (provider === "imports") {
      const [memory, sui, neon] = await Promise.all([
        import("@mysten-incubation/memwal"), import("@mysten/sui/grpc"), import("@neondatabase/serverless"),
      ]);
      if (typeof memory.MemWal.create !== "function" || typeof sui.SuiGrpcClient !== "function" || typeof neon.neon !== "function") throw new Error("IMPORT_FAILED");
      return { provider, status: "passed", code: "WORKERS_IMPORTS_OK" };
    }
    if (provider === "neon" && config.DATABASE_URL) {
      const { createDatabase } = await import("../db/client");
      const db = createDatabase(config.DATABASE_URL);
      const results = await db.batch([db.execute(sql`select 1 as value`), db.execute(sql`select 2 as value`)]);
      if (results[0].rows[0]?.value !== 1 || results[1].rows[0]?.value !== 2) throw new Error("QUERY_FAILED");
      return { provider, status: "passed", code: "READ_ONLY_BATCH_OK" };
    }
    if (provider === "tatum" && config.TATUM_API_KEY && config.TATUM_TRANSACTION_DIGEST) {
      const { observeTransaction } = await import("./tatum");
      const observation = await observeTransaction(config.TATUM_API_KEY, config.TATUM_TRANSACTION_DIGEST);
      return { provider, status: "passed", code: "GRPC_WEB_READ_OK", details: observation };
    }
    if (provider === "walrus") {
      const { createMemoryClient, memoryProbeText } = await import("./memory");
      const client = await createMemoryClient(config);
      const result = await client.recall({ query: "Talo compatibility probe", limit: 1, maxTokens: 200 });
      // A successful empty recall verifies authenticated access, not persistence.
      return { provider, status: "passed", code: "AUTHENTICATED_RECALL_OK", details: {
        resultCount: result.results.length,
        syntheticProbeFound: result.results.some((item) => Boolean(item.blob_id) && item.text === memoryProbeText),
        writeVerified: false,
      } };
    }
    throw new Error("PROVIDER_NOT_CONFIGURED");
  } catch (error) { return { provider, status: "failed", code: failureCode(error) }; }
}
