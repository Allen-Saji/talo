import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTatumClient, observeTransaction } from "../lib/providers/tatum";

const sdk = vi.hoisted(() => ({ options: vi.fn(), info: vi.fn(), transaction: vi.fn() }));
vi.mock("@mysten/sui/grpc", () => ({
  SuiGrpcClient: class {
    constructor(options: unknown) { sdk.options(options); }
    ledgerService = { getServiceInfo: sdk.info, getTransaction: sdk.transaction };
  },
}));
const digest = "4VACjdawTR6KyT17YKRC91WUcgtuWUbx7R6twbk7Uwmz";
const chainId = "4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S";
beforeEach(() => {
  vi.resetAllMocks();
  sdk.info.mockResolvedValue({ response: { chain: "mainnet", chainId } });
  sdk.transaction.mockResolvedValue({ response: { transaction: {
    digest, transaction: { sender: "0x123" }, effects: { status: { success: true } }, checkpoint: 123n,
    timestamp: { seconds: 100n, nanos: 0 }, balanceChanges: [{ address: "0x123", coinType: "0x2::sui::SUI", amount: "-10000000000000001" }],
  } } });
});

describe("Tatum transaction observation", () => {
  it("requests Cloudflare's native gRPC conversion without following redirects", () => {
    createTatumClient("test-api-key");
    expect(sdk.options).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: "https://sui-mainnet-grpc.gateway.tatum.io", meta: { "x-api-key": "test-api-key" },
      fetchInit: { redirect: "manual", cf: { grpcWeb: "convert" } },
    }));
  });
  it("reads explicit chain fields without claiming invoice attribution", async () => {
    const result = await observeTransaction("test-api-key", digest);
    expect(result).toMatchObject({ network: "mainnet", chainId, digest, execution: "success", checkpoint: "123", invoiceMatch: "not_evaluated" });
    expect(result.balanceChanges[0].amount).toBe("-10000000000000001");
    expect(sdk.transaction).toHaveBeenCalledWith({ digest, readMask: { paths: ["digest", "transaction.sender", "effects.status", "checkpoint", "timestamp", "balance_changes"] } });
  });
  it("rejects invalid input before making a provider call", async () => {
    await expect(observeTransaction("test-api-key", "invalid")).rejects.toThrow("INVALID_DIGEST");
    expect(sdk.info).not.toHaveBeenCalled();
  });
  it("rejects a different network before fetching transaction data", async () => {
    sdk.info.mockResolvedValue({ response: { chain: "testnet", chainId: "other" } });
    await expect(observeTransaction("test-api-key", digest)).rejects.toThrow("NETWORK_NOT_VERIFIED");
    expect(sdk.transaction).not.toHaveBeenCalled();
  });
  it("rejects a response for a different digest", async () => {
    sdk.transaction.mockResolvedValue({ response: { transaction: { digest: "other" } } });
    await expect(observeTransaction("test-api-key", digest)).rejects.toThrow("INCOMPLETE_TRANSACTION");
  });
});
