import { z } from "zod";

export const suiCoinType = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
export const mainnetChainId = "4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S";
const address = z.string().regex(/^0x[0-9a-f]{64}$/i).transform((value) => value.toLowerCase());
const inputArg = z.object({ kind: z.literal(2), input: z.number().int().min(0).max(1) });
const simple = z.object({
  sender: address,
  gasPayment: z.object({ owner: address }),
  kind: z.object({ data: z.object({ oneofKind: z.literal("programmableTransaction"), programmableTransaction: z.object({
    inputs: z.array(z.object({ kind: z.literal(1), pure: z.instanceof(Uint8Array) })).length(2),
    commands: z.tuple([
      z.object({ command: z.object({ oneofKind: z.literal("splitCoins"), splitCoins: z.object({ coin: z.object({ kind: z.literal(1) }), amounts: z.tuple([inputArg]) }) }) }),
      z.object({ command: z.object({ oneofKind: z.literal("transferObjects"), transferObjects: z.object({ address: inputArg, objects: z.tuple([z.object({ kind: z.literal(3), result: z.literal(0), subresult: z.literal(0) })]) }) }) }),
    ]),
  }) }) }),
});
export type SimpleTransfer = { sender: string; recipient: string; amount: string; coinType: string };
export function parseSimpleSuiTransfer(transaction: unknown, balanceChanges: Array<{ address?: string; coinType?: string; amount?: string }>): SimpleTransfer | null {
  const parsed = simple.safeParse(transaction);
  if (!parsed.success) return null;
  const tx = parsed.data, pt = tx.kind.data.programmableTransaction;
  const amountIndex = pt.commands[0].command.splitCoins.amounts[0].input;
  const recipientIndex = pt.commands[1].command.transferObjects.address.input;
  if (amountIndex === recipientIndex || tx.gasPayment.owner !== tx.sender) return null;
  const amountBytes = pt.inputs[amountIndex].pure, recipientBytes = pt.inputs[recipientIndex].pure;
  if (amountBytes.length !== 8 || recipientBytes.length !== 32) return null;
  const amount = new DataView(amountBytes.buffer, amountBytes.byteOffset, 8).getBigUint64(0, true);
  const recipient = `0x${Buffer.from(recipientBytes).toString("hex")}`;
  if (amount <= 0n || recipient === tx.sender || balanceChanges.length !== 2) return null;
  const changes = z.array(z.object({ address, coinType: z.string(), amount: z.string().regex(/^-?\d+$/) })).safeParse(balanceChanges);
  if (!changes.success) return null;
  const normalized = changes.data;
  if (normalized.some((change) => change.coinType !== suiCoinType || !/^-?\d+$/.test(change.amount))) return null;
  const credit = normalized.find((change) => change.address === recipient);
  const debit = normalized.find((change) => change.address === tx.sender);
  if (!credit || !debit || BigInt(credit.amount) !== amount || BigInt(debit.amount) > -amount) return null;
  return { sender: tx.sender, recipient, amount: amount.toString(), coinType: suiCoinType };
}
export type InvoiceExpectation = SimpleTransfer & { digest: string; chainId: string; network: string; notBefore: string; notAfter: string };
export type PaymentObservation = { digest: string; chainId: string; network: string; execution: string; checkpoint: string | null; timestamp: { seconds: string; nanos: number } | null; transfer: SimpleTransfer | null };
export function matchInvoice(expected: InvoiceExpectation, observed: PaymentObservation): { status: "match" | "mismatch" | "ambiguous"; reason: string } {
  if (observed.digest !== expected.digest) return { status: "mismatch", reason: "DIGEST_NOT_BOUND" };
  if (observed.network !== expected.network || observed.chainId !== expected.chainId) return { status: "mismatch", reason: "WRONG_NETWORK" };
  if (observed.execution === "failed") return { status: "mismatch", reason: "EXECUTION_FAILED" };
  if (observed.execution !== "success" || !observed.checkpoint || !observed.timestamp) return { status: "ambiguous", reason: "UNCONFIRMED_TRANSACTION" };
  const time = BigInt(observed.timestamp.seconds);
  if (time < BigInt(expected.notBefore) || time > BigInt(expected.notAfter)) return { status: "mismatch", reason: "OUTSIDE_INVOICE_WINDOW" };
  if (!observed.transfer) return { status: "ambiguous", reason: "UNSUPPORTED_TRANSACTION_PATTERN" };
  for (const key of ["sender", "recipient", "coinType", "amount"] as const) {
    if (observed.transfer[key] !== expected[key]) return { status: "mismatch", reason: `WRONG_${key.toUpperCase()}` };
  }
  return { status: "match", reason: "BOUND_TRANSFER_MATCH" };
}
