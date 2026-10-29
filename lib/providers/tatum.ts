import { parseSimpleSuiTransfer } from "../payments/matcher";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { isValidTransactionDigest } from "@mysten/sui/utils";

export function createTatumClient(apiKey: string) {
  return new SuiGrpcClient({
    network: "mainnet",
    baseUrl: "https://sui-mainnet-grpc.gateway.tatum.io",
    format: "binary",
    meta: { "x-api-key": apiKey },
    timeout: 10_000,
    // Tatum serves native gRPC. Convert at Cloudflare's edge, preserving trailers.
    fetchInit: { redirect: "manual", cf: { grpcWeb: "convert" } },
  });
}

export async function observeTransaction(apiKey: string, digest: string) {
  if (!isValidTransactionDigest(digest)) throw new Error("INVALID_DIGEST");
  const client = createTatumClient(apiKey);
  const { response: info } = await client.ledgerService.getServiceInfo({});
  if (info.chain !== "mainnet" || !info.chainId) throw new Error("NETWORK_NOT_VERIFIED");
  const { response } = await client.ledgerService.getTransaction({
    digest,
    readMask: { paths: ["digest", "transaction.sender", "transaction.kind", "transaction.gas_payment", "effects.status", "checkpoint", "timestamp", "balance_changes"] },
  });
  const transaction = response.transaction;
  if (!transaction || transaction.digest !== digest) throw new Error("INCOMPLETE_TRANSACTION");
  // This provider returns chain evidence for the separate invoice matcher.
  return {
    provider: "tatum", network: "mainnet", chainId: info.chainId,
    digest, observedAt: new Date().toISOString(),
    execution: transaction.effects?.status?.success === true ? "success"
      : transaction.effects?.status?.success === false ? "failed" : "unknown",
    sender: transaction.transaction?.sender ?? null,
    checkpoint: transaction.checkpoint?.toString() ?? null,
    timestamp: transaction.timestamp ? { seconds: transaction.timestamp.seconds.toString(), nanos: transaction.timestamp.nanos } : null,
    balanceChanges: transaction.balanceChanges.map((change) => ({ address: change.address, coinType: change.coinType, amount: change.amount })),
    transfer: parseSimpleSuiTransfer(transaction.transaction, transaction.balanceChanges),
    invoiceMatch: "not_evaluated",
  };
}
