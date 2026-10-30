"use client";
import LoadingIndicator from "../loading-indicator";
import { useEffect, useState } from "react";
import type { InvoiceEvidence } from "../../lib/payments/invoice";
import { requestJson } from "../../lib/client-http";

export default function Billing() {
  const [status, setStatus] = useState<{ invoiceId: string; entitlement: string; storage: "neon" | "fixture"; payment: InvoiceEvidence } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void requestJson<{ invoiceId: string; entitlement: string; storage: "neon" | "fixture"; payment: InvoiceEvidence }>("/api/billing").then((data) => {
      if (active) setStatus(data);
    }).catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  return <main className="container"><header><a className="wordmark" href="/playground">talo</a><span className="badge">Synthetic billing demo</span></header><section className="intro"><h1>Billing status</h1><p>Synthetic invoice and application access for your selected demo customer.</p></section>{error && <p role="alert">{error}</p>}{status ? <dl><div><dt>Invoice</dt><dd>{status.invoiceId}</dd></div><div><dt>App access</dt><dd>{status.entitlement}</dd></div><div><dt>Sample transaction execution</dt><dd>{status.payment.execution}</dd></div><div><dt>Sample invoice match</dt><dd>{status.payment.invoiceMatch} ({status.payment.source})</dd></div></dl> : !error && <LoadingIndicator label="Loading billing details" />}<a href="/playground">Return to support</a></main>;
}
