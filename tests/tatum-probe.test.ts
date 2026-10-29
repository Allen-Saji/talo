import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../workers/tatum-probe";

const observe = vi.hoisted(() => vi.fn());
vi.mock("../lib/providers/tatum", () => ({ observeTransaction: observe }));
const env = { PROBE_TOKEN: "test-only-probe-token-at-least-32-characters", TATUM_API_KEY: "test-api-key", TATUM_TRANSACTION_DIGEST: "configured-digest" };
const headers = { Authorization: `Bearer ${env.PROBE_TOKEN}` };
beforeEach(() => vi.resetAllMocks());

describe("edge Tatum probe boundary", () => {
  it("rejects missing and incorrect credentials before calling Tatum", async () => {
    const cases: HeadersInit[] = [{}, { Authorization: "Bearer wrong" }, { Authorization: `Bearer ${"x".repeat(env.PROBE_TOKEN.length)}` }];
    for (const requestHeaders of cases) {
      const response = await worker.fetch(new Request("https://probe.example/check", { method: "POST", headers: requestHeaders }), env);
      expect(response.status).toBe(401);
    }
    expect(observe).not.toHaveBeenCalled();
  });
  it.each(["", "short"])("rejects unsafe probe-token configuration %s", async (token) => {
    const response = await worker.fetch(new Request("https://probe.example/check", { method: "POST", headers: { Authorization: `Bearer ${token}` } }), { ...env, PROBE_TOKEN: token });
    expect(response.status).toBe(401);
    expect(observe).not.toHaveBeenCalled();
  });
  it("rejects other methods and paths without a provider call", async () => {
    for (const [method, path] of [["GET", "/check"], ["POST", "/other"]]) {
      const response = await worker.fetch(new Request(`https://probe.example${path}`, { method, headers }), env);
      expect(response.status).toBe(404);
    }
    expect(observe).not.toHaveBeenCalled();
  });
  it("uses only configured input and prevents response caching", async () => {
    observe.mockResolvedValue({ digest: env.TATUM_TRANSACTION_DIGEST, network: "mainnet" });
    const response = await worker.fetch(new Request("https://probe.example/check", { method: "POST", headers, body: JSON.stringify({ digest: "untrusted-input" }) }), env);
    expect(observe).toHaveBeenCalledWith(env.TATUM_API_KEY, env.TATUM_TRANSACTION_DIGEST);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "passed", runtime: "cloudflare-workers", code: "GRPC_EDGE_READ_OK" });
  });
  it("returns stable errors without exposing upstream messages", async () => {
    observe.mockRejectedValue(Object.assign(new Error("sensitive-provider-details"), { code: "UNAUTHENTICATED" }));
    const response = await worker.fetch(new Request("https://probe.example/check", { method: "POST", headers }), env);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain("UNAUTHENTICATED");
    expect(text).not.toContain("sensitive");
  });
});
