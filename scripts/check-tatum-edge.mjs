import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { loadLocalEnv } from "./local-env.mjs";

async function main() {
  loadLocalEnv();
  const deployment = existsSync(".wrangler/tatum-edge-deployment.json")
    ? JSON.parse(readFileSync(".wrangler/tatum-edge-deployment.json", "utf8")) : {};
  const endpoint = new URL("/check", process.argv[2] ?? deployment.url);
  assert.equal(endpoint.protocol, "https:");
  assert.match(endpoint.hostname, /^talo-tatum-probe\.[a-z0-9-]+\.workers\.dev$/);
  const { PROBE_TOKEN } = JSON.parse(readFileSync(".wrangler/tatum-edge-secrets.json", "utf8"));
  assert.ok(typeof PROBE_TOKEN === "string" && PROBE_TOKEN.length >= 32);
  assert.ok(process.env.TATUM_TRANSACTION_DIGEST);
  const headers = { Authorization: `Bearer ${PROBE_TOKEN}` };
  for (const options of [{ method: "POST" }, { method: "POST", headers: { Authorization: "Bearer invalid" } }, { method: "GET", headers }]) {
    const response = await fetch(endpoint, { ...options, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, options.method === "GET" ? 404 : 401);
  }
  console.log("Edge access controls: passed.");
  const response = await fetch(endpoint, { method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const edge = await response.json();
  assert.equal(edge.status, "passed");
  assert.equal(edge.runtime, "cloudflare-workers");
  assert.ok(edge.colo);

  // Query an independent public source without ever sending it the Tatum key.
  const sourceUrl = "https://fullnode.mainnet.sui.io:443";
  const client = new SuiGrpcClient({ network: "mainnet", baseUrl: sourceUrl, format: "binary", timeout: 15_000 });
  const { response: info } = await client.ledgerService.getServiceInfo({});
  assert.equal(info.chain, "mainnet");
  assert.ok(info.chainId);
  const { response: observed } = await client.ledgerService.getTransaction({
    digest: process.env.TATUM_TRANSACTION_DIGEST,
    readMask: { paths: ["digest", "transaction.sender", "effects.status", "checkpoint"] },
  });
  const transaction = observed.transaction;
  assert.ok(transaction?.transaction?.sender && transaction.checkpoint !== undefined);
  assert.equal(typeof transaction.effects?.status?.success, "boolean");
  const source = {
    network: info.chain, chainId: info.chainId, digest: transaction.digest,
    sender: transaction.transaction.sender, checkpoint: transaction.checkpoint.toString(),
    execution: transaction.effects.status.success ? "success" : "failed",
  };
  assert.equal(source.digest, process.env.TATUM_TRANSACTION_DIGEST);
  for (const [key, value] of Object.entries(source)) assert.equal(edge.details[key], value);
  assert.equal(edge.details.invoiceMatch, "not_evaluated");
  writeFileSync(".wrangler/tatum-edge-result.json", JSON.stringify({ url: endpoint.origin, sourceUrl, source, ...edge }, null, 2) + "\n", { mode: 0o600 });
  console.log(`tatum: passed (${edge.code}; Cloudflare ${edge.colo}).`);
  console.log("Independent Mainnet comparison: passed (chain, digest, sender, execution, checkpoint).");
}

main().catch(() => {
  console.error("Tatum edge check failed. Check the deployed probe, local URL/token configuration, and provider availability. Credentials and upstream details hidden.");
  process.exitCode = 1;
});
