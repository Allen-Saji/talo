import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../workers/memory-probe";
const provider = vi.hoisted(() => ({ submit: vi.fn(), status: vi.fn(), recall: vi.fn() }));
vi.mock("../lib/providers/memory", () => ({
  memoryProbeNamespace: "talo-compatibility", memoryProbeText: "fixed synthetic text",
  submitProbeMemory: provider.submit, probeMemoryStatus: provider.status,
  createMemoryClient: async () => ({ recall: provider.recall }),
}));
const env = { PROBE_TOKEN: "test-only-token-longer-than-thirty-two-characters", PROBE_JOB_ID: "existing-job", PROBE_BLOB_ID: "existing-blob" };
const request = (path: string, token = env.PROBE_TOKEN) => new Request(`https://probe.example${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: '{"text":"attacker-controlled"}' });
beforeEach(() => vi.resetAllMocks());
describe("Workers memory probe", () => {
  it("requires authentication before submitting any write", async () => {
    expect((await worker.fetch(request("/write", "wrong"), env)).status).toBe(401);
    expect(provider.submit).not.toHaveBeenCalled();
  });
  it("submits only fixed text and the original idempotency key", async () => {
    provider.submit.mockResolvedValue({ providerJobId: "existing-job" });
    expect((await worker.fetch(request("/write"), env)).status).toBe(200);
    expect(provider.submit).toHaveBeenCalledWith(expect.anything(), "talo-compatibility-setup-v1", "fixed synthetic text");
  });
  it("rejects a new job rather than calling it a deduplicated write", async () => {
    provider.submit.mockResolvedValue({ providerJobId: "different-job" });
    expect((await worker.fetch(request("/write"), env)).status).toBe(502);
  });
  it("requires completed status and exact text/blob recall", async () => {
    provider.status.mockResolvedValue({ state: "saved", blobId: "existing-blob" });
    provider.recall.mockResolvedValue({ results: [{ blob_id: "existing-blob", text: "wrong" }] });
    expect((await worker.fetch(request("/verify"), env)).status).toBe(502);
    provider.recall.mockResolvedValue({ results: [{ blob_id: "existing-blob", text: "fixed synthetic text" }] });
    expect((await worker.fetch(request("/verify"), env)).status).toBe(200);
  });
});
