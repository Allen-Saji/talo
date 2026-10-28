import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { readConfig } from "../lib/config";
import { createMemoryClient, memoryProbeNamespace, memoryProbeText, probeMemoryStatus, submitProbeMemory } from "../lib/providers/memory";
import { loadLocalEnv } from "./local-env.mjs";

const stateFile = ".wrangler/talo-memory-check.json";
const stateSchema = z.object({ accountId: z.string(), providerJobId: z.string().optional(), blobId: z.string().optional() }).strict();

async function main() {
  const command = process.argv[2];
  if (!["write", "verify"].includes(command)) {
    console.log("Usage: npm run check:memory -- write|verify");
    console.log("write: submit one synthetic Mainnet record in talo-compatibility.");
    console.log("verify: check completion and recall that exact record in a fresh process.");
    return;
  }
  loadLocalEnv();
  const config = readConfig(process.env);
  if (!config.MEMWAL_ACCOUNT_ID || !config.MEMWAL_PRIVATE_KEY) throw new Error("MEMORY_NOT_CONFIGURED");
  const state = existsSync(stateFile)
    ? stateSchema.parse(JSON.parse(readFileSync(stateFile, "utf8")))
    : { accountId: config.MEMWAL_ACCOUNT_ID };
  if (state.accountId !== config.MEMWAL_ACCOUNT_ID) throw new Error("PROBE_ACCOUNT_MISMATCH");
  const save = () => {
    mkdirSync(".wrangler", { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state) + "\n", { mode: 0o600 });
  };
  if (command === "write") {
    if (!state.providerJobId) {
      const result = await submitProbeMemory(config, "talo-compatibility-setup-v1", memoryProbeText);
      state.providerJobId = result.providerJobId;
      save();
    }
    console.log("Walrus synthetic probe: submitted. Completion is not yet verified.");
    console.log("Retained job reference in ignored local state; reruns reuse the same idempotency key.");
    return;
  }
  if (!state.providerJobId) throw new Error("PROBE_NOT_SUBMITTED");
  const result = await probeMemoryStatus(config, state.providerJobId);
  if (result.state !== "saved") {
    console.log(`Walrus synthetic probe: ${result.state}. No new write submitted.`);
    process.exitCode = result.state === "submitted" ? 2 : 1;
    return;
  }
  state.blobId = result.blobId;
  save();
  const client = await createMemoryClient(config);
  const recalled = await client.recall({ query: memoryProbeText, namespace: memoryProbeNamespace, limit: 5, maxTokens: 500 });
  const found = recalled.results.some((item) => item.blob_id === state.blobId && item.text === memoryProbeText);
  if (!found) throw new Error("PROBE_NOT_RECALLED");
  console.log("Walrus synthetic probe: saved (completed job, blob reference, and namespace verified).");
  console.log("Fresh-process recall: passed (exact synthetic text and blob matched).");
}

main().catch((error: unknown) => {
  const allowed = ["MEMORY_NOT_CONFIGURED", "PROBE_ACCOUNT_MISMATCH", "PROBE_NOT_SUBMITTED", "PROBE_NOT_RECALLED"];
  const message = error instanceof Error && allowed.includes(error.message) ? error.message : "MEMORY_CHECK_FAILED";
  console.error(`Walrus check failed: ${message}. Upstream details and credentials hidden.`);
  process.exitCode = 1;
});
