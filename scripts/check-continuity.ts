import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { loadLocalEnv } from "./local-env.mjs";
import { createDatabase } from "../lib/db/client";
import { memoryJobs } from "../lib/db/schema";
import sample from "../lib/payments/sample.json";
import { parseSimpleSuiTransfer, matchInvoice } from "../lib/payments/matcher";

async function main() {
  loadLocalEnv(); const command = process.argv[2]; assert.ok(["enqueue", "verify"].includes(command));
  const base = "https://talo.metropolis-frontend.workers.dev";
  const path = ".wrangler/public-auth-check.json";
  const state = JSON.parse(readFileSync(path, "utf8")); const account = state.accounts[0];
  const request = (path: string, body?: unknown, cookie = "") => fetch(base + path, { method: body ? "POST" : "GET", headers: { Origin: base, "Content-Type": "application/json", Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(60_000) });
  const login = await request("/api/auth/sign-in/email", { email: account.email, password: account.password }); assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  try {
    const profile = await (await request("/api/session", undefined, cookie)).json() as { user: { caseId: string } };
    const billing = await request("/api/billing", undefined, cookie); assert.equal(billing.status, 200);
    const invoice = await billing.json() as { payment: { source: string; invoiceMatch: string; scenario: string; digest: string; sample: typeof sample } };
    assert.equal(invoice.payment.source, "tatum"); assert.equal(invoice.payment.invoiceMatch, "match");
    assert.equal(invoice.payment.scenario, "historical-sample"); assert.equal(invoice.payment.digest, sample.digest);
    if (command === "enqueue") {
      const client = new SuiGrpcClient({ network: "mainnet", baseUrl: "https://fullnode.mainnet.sui.io:443", format: "binary", timeout: 15_000 });
      const { response: info } = await client.ledgerService.getServiceInfo({});
      const { response } = await client.ledgerService.getTransaction({ digest: sample.digest, readMask: { paths: ["digest", "transaction", "effects.status", "checkpoint", "timestamp", "balance_changes"] } });
      const tx = response.transaction!;
      const independent = { digest: tx.digest!, chainId: info.chainId!, network: info.chain!, execution: tx.effects?.status?.success ? "success" : "failed", checkpoint: tx.checkpoint?.toString() ?? null, timestamp: tx.timestamp ? { seconds: tx.timestamp.seconds.toString(), nanos: tx.timestamp.nanos } : null, transfer: parseSimpleSuiTransfer(tx.transaction, tx.balanceChanges) };
      assert.equal(matchInvoice(sample, independent).status, "match");
      account.attemptEventId ??= randomUUID(); writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
      const saved = await request("/api/memory", { action: "attempt", caseId: profile.user.caseId, eventId: account.attemptEventId, step: "refresh", outcome: "not-helped" }, cookie);
      assert.equal(saved.status, 202); account.attemptJobId = (await saved.json() as { id: string }).id;
      writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
      assert.equal((await request("/api/lessons", undefined, cookie)).status, 403);
      assert.equal((await request("/api/lessons", { action: "approve", id: "not-owned" }, cookie)).status, 403);
      console.log("Live Tatum sample match independently verified. Scoped attempt enqueued; ordinary accounts cannot approve lessons."); return;
    }
    const [job] = await createDatabase(process.env.DATABASE_URL!).select().from(memoryJobs).where(eq(memoryJobs.id, account.attemptJobId));
    if (job?.state !== "saved") { console.log(`Attempt job: ${job?.state ?? "missing"}; attempts: ${job?.attemptCount ?? 0}.`); process.exitCode = 2; return; }
    const support = await request("/api/support", { caseId: profile.user.caseId, message: "I already refreshed and it did not help. Check my sample invoice and next steps." }, cookie);
    assert.equal(support.status, 200);
    const answer = await support.json() as { evidence: { history: { source: string }; payment: { invoiceMatch: string }; memory: { source: string } }; attempts: string[]; generation: string };
    assert.equal(answer.evidence.history.source, "walrus"); assert.equal(answer.evidence.memory.source, "walrus");
    assert.equal(answer.evidence.payment.invoiceMatch, "match");
    assert.ok(answer.attempts.some((text) => text.includes("Refresh the page") && text.includes("did not resolve")));
    writeFileSync(".wrangler/continuity-result.json", JSON.stringify({ payment: "historical-sample-match", history: "walrus", preference: "walrus", generation: answer.generation }), { mode: 0o600 });
    console.log(`Public continuity passed: Tatum sample match, saved attempt recall, preserved preference. Generation: ${answer.generation}.`);
  } finally { await request("/api/auth/sign-out", {}, cookie); }
}
main().catch((error) => { if (error?.code === "ERR_ASSERTION") console.error(error.message); console.error("Continuity check failed; credentials hidden."); process.exitCode = 1; });
