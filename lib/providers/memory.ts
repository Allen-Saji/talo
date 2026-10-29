import type { Config } from "../config";

// Reserved for synthetic integration probes; never use customer namespaces here.
export const memoryProbeNamespace = "talo-compatibility";
export const memoryProbeText = "Talo compatibility probe: the synthetic demo assistant gives one step at a time. This setup check contains no customer data.";
export async function createMemoryClient(config: Config, namespace = memoryProbeNamespace) {
  if (!config.MEMWAL_PRIVATE_KEY || !config.MEMWAL_ACCOUNT_ID) throw new Error("MEMORY_NOT_CONFIGURED");
  const { MemWal } = await import("@mysten-incubation/memwal");
  return MemWal.create({
    key: config.MEMWAL_PRIVATE_KEY, accountId: config.MEMWAL_ACCOUNT_ID,
    serverUrl: config.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz", namespace,
    requestTimeoutMs: 10_000, preflightTimeoutMs: 5_000, recallTimeoutMs: 10_000,
  });
}

// Submission is intentionally separate from completion. No route calls this yet.
export async function submitProbeMemory(config: Config, eventId: string, text: string) {
  const client = await createMemoryClient(config);
  const accepted = await client.remember(text, { idempotencyKey: eventId, dedupe: true });
  return { state: "submitted" as const, providerJobId: accepted.job_id };
}

export async function probeMemoryStatus(config: Config, providerJobId: string) {
  const client = await createMemoryClient(config);
  const result = await client.getRememberStatus(providerJobId);
  if (result.status === "done" && result.blob_id && result.namespace === memoryProbeNamespace) {
    return { state: "saved" as const, providerJobId, blobId: result.blob_id };
  }
  if (["pending", "running", "uploaded"].includes(result.status)) {
    return { state: "submitted" as const, providerJobId };
  }
  return { state: result.status === "failed" ? "failed" as const : "unknown" as const, providerJobId };
}

export async function submitMemory(config: Config, namespace: string, eventId: string, text: string) {
  const client = await createMemoryClient(config, namespace);
  const result = await client.remember(text, { idempotencyKey: eventId, dedupe: true });
  if (!result.job_id) throw new Error("INVALID_MEMORY_RECEIPT");
  return result.job_id;
}

export async function memoryStatus(config: Config, namespace: string, providerJobId: string) {
  const client = await createMemoryClient(config, namespace);
  const result = await client.getRememberStatus(providerJobId);
  if (result.job_id !== providerJobId || (result.namespace && result.namespace !== namespace)) return { state: "unknown" as const };
  if (result.status === "done" && result.blob_id && result.namespace === namespace) return { state: "saved" as const, blobId: result.blob_id };
  if (result.status === "failed") return { state: "failed" as const };
  if (["pending", "running", "uploaded"].includes(result.status)) return { state: "submitted" as const };
  return { state: "unknown" as const };
}
