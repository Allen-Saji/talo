import { describe, expect, it } from "vitest";
import { parseSimpleSuiTransfer, matchInvoice, mainnetChainId } from "../lib/payments/matcher";
import expected from "../lib/payments/sample.json";
import fixture from "./fixtures/sui-transfer.json";
function transaction() {
  const tx = structuredClone(fixture.transaction);
  const pt = tx.kind.data.programmableTransaction;
  return { ...tx, kind: { ...tx.kind, data: { ...tx.kind.data, programmableTransaction: { ...pt, inputs: pt.inputs.map((i) => ({ ...i, pure: new Uint8Array(Buffer.from(i.pure, "base64")) })) } } } };
}
const observation = () => ({ digest: fixture.digest, chainId: mainnetChainId, network: "mainnet", execution: "success", checkpoint: "1", timestamp: fixture.timestamp, transfer: parseSimpleSuiTransfer(transaction(), fixture.balanceChanges) });
describe("read-only sample invoice attribution", () => {
  it("decodes a real historical transfer and exact u64 amount", () => {
    expect(observation().transfer).toEqual({ sender: expected.sender, recipient: expected.recipient, amount: expected.amount, coinType: expected.coinType });
    expect(matchInvoice(expected, observation())).toEqual({ status: "match", reason: "BOUND_TRANSFER_MATCH" });
  });
  it.each(["sender", "recipient", "amount", "coinType", "digest", "chainId", "network"] as const)("rejects mismatched %s", (field) => {
    expect(matchInvoice({ ...expected, [field]: "different" }, observation()).status).toBe("mismatch");
  });
  it("rejects time-window mismatch and failed execution", () => {
    expect(matchInvoice({ ...expected, notBefore: String(BigInt(expected.notBefore) + 1n) }, observation()).reason).toBe("OUTSIDE_INVOICE_WINDOW");
    expect(matchInvoice(expected, { ...observation(), execution: "failed" }).reason).toBe("EXECUTION_FAILED");
    expect(matchInvoice(expected, { ...observation(), checkpoint: null }).status).toBe("ambiguous");
  });
  it("does not treat arbitrary successful transactions as payments", () => {
    expect(matchInvoice(expected, { ...observation(), transfer: null }).status).toBe("ambiguous");
    const tx = transaction(); tx.kind.data.programmableTransaction.commands.push(tx.kind.data.programmableTransaction.commands[0]);
    expect(parseSimpleSuiTransfer(tx, fixture.balanceChanges)).toBeNull();
  });
  it("rejects sponsored gas, malformed inputs and inconsistent balances", () => {
    const tx = transaction(); tx.gasPayment.owner = expected.recipient;
    expect(parseSimpleSuiTransfer(tx, fixture.balanceChanges)).toBeNull();
    const malformed = transaction(); malformed.kind.data.programmableTransaction.inputs[0].pure = new Uint8Array(7);
    expect(parseSimpleSuiTransfer(malformed, fixture.balanceChanges)).toBeNull();
    expect(parseSimpleSuiTransfer(transaction(), fixture.balanceChanges.map((b) => b.amount[0] !== "-" ? { ...b, amount: "1" } : b))).toBeNull();
  });
});
