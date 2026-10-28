"use client";
import { useEffect, useState } from "react";
import { requestJson } from "../../lib/client-http";

export default function Billing() {
  const [status, setStatus] = useState<{ invoiceId: string; entitlement: string; storage: "neon" | "fixture" } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void requestJson<{ invoiceId: string; entitlement: string; storage: "neon" | "fixture" }>("/api/billing").then((data) => {
      if (active) setStatus(data);
    }).catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  return <main className="container"><header><a className="wordmark" href="/">talo</a><span className="badge">Local fixture mode</span></header><section className="intro"><h1>Billing status</h1><p>Synthetic invoice and application access for your selected demo customer.</p></section>{error && <p role="alert">{error}</p>}{status ? <dl><div><dt>Invoice</dt><dd>{status.invoiceId}</dd></div><div><dt>App access</dt><dd>{status.entitlement}</dd></div></dl> : !error && <p role="status">Loading billing status...</p>}<a href="/">Return to support</a></main>;
}
