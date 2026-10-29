import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config";
import { createDatabase } from "../db/client";
import { paymentObservations } from "../db/schema";
import { observeTransaction } from "../providers/tatum";
import { matchInvoice } from "./matcher";
import sample from "./sample.json";

const observationSchema = z.object({
  provider: z.literal("tatum"), digest: z.string(), network: z.string(), chainId: z.string(), observedAt: z.string(),
  execution: z.string(), checkpoint: z.string().nullable(), timestamp: z.object({ seconds: z.string().regex(/^\d+$/), nanos: z.number() }).nullable(),
  transfer: z.object({ sender: z.string(), recipient: z.string(), amount: z.string().regex(/^\d+$/), coinType: z.string() }).nullable(),
});
export type InvoiceEvidence = { source: "tatum" | "unavailable"; scenario: "historical-sample"; execution: string; invoiceMatch: string; invoiceId: string; digest: string; observedAt: string | null; reason: string; sample: typeof sample };
// Called only after owned-case authorization. The sample binding is server-owned and
// replayable by design; this code never settles invoices or accepts caller digests.
export async function inspectSampleInvoice(config: Config, invoiceId: string): Promise<InvoiceEvidence> {
  const base = { scenario: "historical-sample" as const, invoiceId, digest: sample.digest, sample };
  try {
    if (!config.DATABASE_URL || !config.TATUM_API_KEY) throw new Error("PAYMENT_UNAVAILABLE");
    const db = createDatabase(config.DATABASE_URL);
    const [cached] = await db.select().from(paymentObservations).where(eq(paymentObservations.digest, sample.digest)).limit(1);
    let observation = cached && Date.now() - cached.observedAt.getTime() < 5 * 60_000 ? observationSchema.parse(cached.observation) : undefined;
    if (!observation) {
      const day = `tatum:${new Date().toISOString().slice(0, 10)}`;
      const reserved = await db.execute(sql`INSERT INTO model_daily_usage (day, requests) VALUES (${day}, 1)
        ON CONFLICT (day) DO UPDATE SET requests = model_daily_usage.requests + 1
        WHERE model_daily_usage.requests < 100 RETURNING requests`);
      if (!reserved.rows.length) throw new Error("PAYMENT_LIMIT");
      observation = observationSchema.parse(await observeTransaction(config.TATUM_API_KEY, sample.digest));
      await db.insert(paymentObservations).values({ digest: sample.digest, observation }).onConflictDoUpdate({ target: paymentObservations.digest, set: { observation, observedAt: new Date() } });
    }
    const match = matchInvoice(sample, observation);
    return { ...base, source: "tatum", execution: observation.execution, invoiceMatch: match.status, reason: match.reason, observedAt: observation.observedAt };
  } catch { return { ...base, source: "unavailable", execution: "unknown", invoiceMatch: "unverified", reason: "LIVE_EVIDENCE_UNAVAILABLE", observedAt: null }; }
}
