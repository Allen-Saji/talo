import { beforeEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../lib/config";
import { probeMemoryStatus, submitProbeMemory } from "../lib/providers/memory";

const sdk = vi.hoisted(() => ({ create: vi.fn(), remember: vi.fn(), getRememberStatus: vi.fn() }));
vi.mock("@mysten-incubation/memwal", () => ({ MemWal: { create: sdk.create } }));
const config = readConfig({ MEMWAL_PRIVATE_KEY: "test-key", MEMWAL_ACCOUNT_ID: "test-account" });
beforeEach(() => {
  vi.resetAllMocks();
  sdk.create.mockReturnValue({ remember: sdk.remember, getRememberStatus: sdk.getRememberStatus });
});

describe("memory completion contract", () => {
  it("submits with a stable idempotency key without claiming completion", async () => {
    sdk.remember.mockResolvedValue({ job_id: "job-1", status: "running" });
    expect(await submitProbeMemory(config, "event-1", "Synthetic attempt")).toEqual({ state: "submitted", providerJobId: "job-1" });
    expect(sdk.remember).toHaveBeenCalledWith("Synthetic attempt", { idempotencyKey: "event-1", dedupe: true });
  });
  it.each(["pending", "running", "uploaded"])("keeps %s jobs submitted", async (status) => {
    sdk.getRememberStatus.mockResolvedValue({ job_id: "job-1", status });
    expect(await probeMemoryStatus(config, "job-1")).toEqual({ state: "submitted", providerJobId: "job-1" });
  });
  it("requires a blob and expected namespace before marking saved", async () => {
    sdk.getRememberStatus.mockResolvedValue({ job_id: "job-1", status: "done", blob_id: "blob-1", namespace: "talo-compatibility" });
    expect(await probeMemoryStatus(config, "job-1")).toMatchObject({ state: "saved", blobId: "blob-1" });
    sdk.getRememberStatus.mockResolvedValue({ job_id: "job-1", status: "done", blob_id: "blob-1", namespace: "other-user" });
    expect(await probeMemoryStatus(config, "job-1")).toMatchObject({ state: "unknown" });
    sdk.getRememberStatus.mockResolvedValue({ job_id: "job-1", status: "done", namespace: "talo-compatibility" });
    expect(await probeMemoryStatus(config, "job-1")).toMatchObject({ state: "unknown" });
  });
  it("does not resubmit failed or missing jobs while checking status", async () => {
    sdk.getRememberStatus.mockResolvedValue({ status: "failed" });
    expect(await probeMemoryStatus(config, "job-1")).toMatchObject({ state: "failed" });
    sdk.getRememberStatus.mockResolvedValue({ status: "not_found" });
    expect(await probeMemoryStatus(config, "job-1")).toMatchObject({ state: "unknown" });
    expect(sdk.remember).not.toHaveBeenCalled();
  });
});
