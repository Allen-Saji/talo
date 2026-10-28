"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { DemoUser } from "../lib/demo/fixtures";
import type { SupportAnswer } from "../lib/support";
import { requestJson } from "../lib/client-http";

export default function SupportPanel() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selected, setSelected] = useState<DemoUser | null>(null);
  const [question, setQuestion] = useState("I paid, but I still can't access my subscription.");
  const [answer, setAnswer] = useState<SupportAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    requestJson<{ users: DemoUser[] }>("/api/session")
      .then((result) => { if (active) setUsers(result.users); })
      .catch((error: Error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  async function selectCustomer(userId: string) {
    setBusy(true); setError(""); setAnswer(null); setSelected(null);
    try {
      const result = await requestJson<{ user: DemoUser }>("/api/session", { userId });
      setSelected(result.user);
    } catch (error) { setError(error instanceof Error ? error.message : "Sign-in failed."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true); setError(""); setAnswer(null);
    try { setAnswer(await requestJson<SupportAnswer>("/api/support", { caseId: selected.caseId, message: question })); }
    catch (error) { setError(error instanceof Error ? error.message : "The request failed."); }
    finally { setBusy(false); }
  }
  return <section className="support" aria-labelledby="support-title">
    <div className="section-heading"><h2 id="support-title">Your support case</h2><span className="muted">Synthetic checkout app</span></div>
    <label htmlFor="customer">Demo customer</label>
    <select id="customer" value={selected?.id ?? ""} disabled={busy || users.length === 0} onChange={(event) => { if (event.target.value) void selectCustomer(event.target.value); }}>
      <option value="" disabled>Choose a customer</option>
      {users.map((user) => <option key={user.id} value={user.id}>{user.name} / {user.tenantName}</option>)}
    </select>
    <form onSubmit={submit}>
      <label htmlFor="question">What do you need help with?</label>
      <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} required disabled={busy} />
      <button type="submit" disabled={!selected || busy}>{busy ? "Working..." : "Investigate access"}</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>
      {answer && <article className="answer">
        <p className="eyebrow">Talo / fixture response</p><h3>Here's where your case stands</h3><p>{answer.answer}</p>
        <dl><div><dt>Invoice</dt><dd>{answer.evidence.payment.invoiceId}</dd></div><div><dt>Payment</dt><dd>Matches (fixture)</dd></div><div><dt>App access</dt><dd>{answer.evidence.entitlement.status}</dd></div></dl>
        <h4>Previous attempts</h4><ul>{answer.attempts.map((attempt) => <li key={attempt}>{attempt}</li>)}</ul>
        <p className="muted">Preference: {answer.preference} Case storage: {answer.storage === "neon" ? "Neon PostgreSQL" : "local fixtures"}. History is synthetic; it has not been retrieved from Walrus.</p>
        <a className="button secondary" href={answer.route.href}>{answer.route.label}</a>
        <details><summary>Prepared handoff</summary><p>{answer.handoff.summary}</p></details>
      </article>}
    </div>
  </section>;
}
