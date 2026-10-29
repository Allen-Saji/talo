"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DemoUser } from "../lib/demo/fixtures";
import type { SupportAnswer } from "../lib/support";
import AuthPanel, { authClient } from "./auth-panel";
import { requestJson } from "../lib/client-http";

export default function SupportPanel() {
  const [publicMode, setPublicMode] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selected, setSelected] = useState<DemoUser | null>(null);
  const [question, setQuestion] = useState("I paid, but I still can't access my subscription.");
  const [answer, setAnswer] = useState<SupportAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preference, setPreference] = useState("short");
  const [memoryNotice, setMemoryNotice] = useState("");
  const memoryEvent = useRef<{ id: string; preference: string } | null>(null);
  useEffect(() => {
    let active = true;
    requestJson<{ mode: string; users: DemoUser[]; user?: DemoUser | null }>("/api/session")
      .then((result) => { if (active) { setUsers(result.users); setPublicMode(result.mode === "public"); setSelected(result.user ?? null); } })
      .catch((error: Error) => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoadingSession(false); });
    return () => { active = false; };
  }, []);
  async function refreshSession() {
    const result = await requestJson<{ user: DemoUser | null }>("/api/session");
    setSelected(result.user); setAnswer(null); setError("");
  }
  async function signOut() {
    setBusy(true);
    try { const result = await (await authClient()).signOut(); if (result.error) throw new Error("Sign-out failed."); setSelected(null); setAnswer(null); setMemoryNotice(""); memoryEvent.current = null; }
    catch { setError("Sign-out failed. Try again."); }
    finally { setBusy(false); }
  }
  async function selectCustomer(userId: string) {
    setBusy(true); setError(""); setAnswer(null); setSelected(null); setMemoryNotice(""); memoryEvent.current = null;
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
  async function savePreference(suppress = false) {
    if (!selected || busy) return;
    setBusy(true); setError(""); setMemoryNotice("");
    try {
      if (suppress) {
        await requestJson("/api/memory", { action: "suppress", caseId: selected.caseId });
        memoryEvent.current = null; setAnswer(null);
        setMemoryNotice("Saved preferences will no longer be used for this case. Provider records have not been deleted.");
      } else {
        if (!memoryEvent.current || memoryEvent.current.preference !== preference) memoryEvent.current = { id: crypto.randomUUID(), preference };
        const result = await requestJson<{ state: string; eligible: boolean }>("/api/memory", { action: "save", caseId: selected.caseId, eventId: memoryEvent.current.id, preference });
        setMemoryNotice(!result.eligible ? "This preference has been suppressed. Choose another preference to save a new event." : result.state === "saved" ? "Preference saved. Investigate again to retrieve it." : "Preference queued. It will be available after storage completes; investigate again in a minute.");
      }
    } catch (error) { setError(error instanceof Error ? error.message : "The preference could not be updated."); }
    finally { setBusy(false); }
  }
  return <section className="support" aria-labelledby="support-title">
    <div className="section-heading"><h2 id="support-title">Your support case</h2><span className="muted">Synthetic checkout app</span></div>
    {loadingSession && <p role="status">Loading your session...</p>}
    {!loadingSession && publicMode && !selected && <AuthPanel onSignedIn={refreshSession} />}
    {publicMode && selected && <p>Signed in as {selected.name}. <button type="button" className="secondary" disabled={busy} onClick={() => void signOut()}>Sign out</button></p>}
    {!publicMode && !loadingSession && <><label htmlFor="customer">Demo customer</label>
    <select id="customer" value={selected?.id ?? ""} disabled={busy || users.length === 0} onChange={(event) => { if (event.target.value) void selectCustomer(event.target.value); }}>
      <option value="" disabled>Choose a customer</option>
      {users.map((user) => <option key={user.id} value={user.id}>{user.name} / {user.tenantName}</option>)}
    </select></>}
    {(!publicMode || selected) && <form onSubmit={submit}>
      <label htmlFor="question">What do you need help with?</label>
      <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={3} required disabled={busy} />
      <button type="submit" disabled={!selected || busy}>{busy ? "Working..." : "Investigate access"}</button>
    </form>}
    {selected && <fieldset disabled={busy}>
      <legend>Remember a support preference</legend>
      <p className="muted">Save only the selected preference to Walrus for this synthetic case. It remains eligible for 30 days.</p>
      <label htmlFor="preference">Instruction style</label>
      <select id="preference" value={preference} onChange={(event) => { setPreference(event.target.value); memoryEvent.current = null; }}>
        <option value="short">Keep instructions short</option>
        <option value="sequential">Give one step at a time</option>
        <option value="mobile">Use mobile instructions</option>
      </select>
      <div className="memory-actions"><button type="button" onClick={() => void savePreference()}>Save preference</button>
      <button type="button" className="secondary" onClick={() => void savePreference(true)}>Stop using saved preferences</button></div>
      {memoryNotice && <p role="status">{memoryNotice}</p>}
    </fieldset>}
    {error && <p role="alert" className="error">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>
      {answer && <article className="answer">
        <p className="eyebrow">Talo / {answer.generation === "openai" ? "OpenAI response" : "deterministic response"}</p><h3>Here's where your case stands</h3><p>{answer.answer}</p>
        <dl><div><dt>Invoice</dt><dd>{answer.evidence.payment.invoiceId}</dd></div><div><dt>Payment</dt><dd>Matches (fixture)</dd></div><div><dt>App access</dt><dd>{answer.evidence.entitlement.status}</dd></div></dl>
        <h4>Previous attempts</h4><ul>{answer.attempts.map((attempt) => <li key={attempt}>{attempt}</li>)}</ul>
        <p className="muted">Preference: {answer.preference} Case storage: {answer.storage === "neon" ? "Neon PostgreSQL" : "local fixtures"}. History is synthetic. Preference source: {answer.evidence.memory.source === "walrus" ? "verified Walrus recall" : "demo fixture"}. Payment evidence remains synthetic.</p>
        <a className="button secondary" href={answer.route.href}>{answer.route.label}</a>
        <details><summary>Prepared handoff</summary><p>{answer.handoff.summary}</p></details>
      </article>}
    </div>
  </section>;
}
