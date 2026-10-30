"use client";
import { useEffect, useState, type FormEvent } from "react";
import AuthPanel, { authClient } from "../auth-panel";
import { applicationInput, type Application } from "../../lib/application-input";
import "./dashboard.css";
import LoadingIndicator, { ButtonSpinner } from "../loading-indicator";
import KnowledgeInput from "./knowledge-input";
import AgentSetup from "./agent-setup";
import ServerSetup from "./server-setup";

export default function Dashboard() {
  const [state, setState] = useState<"loading" | "signin" | "ready" | "error">("loading");
  const [app, setApp] = useState<Application | null>(null);
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
  const [docs, setDocs] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [embedBase, setEmbedBase] = useState("");
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function load() {
    setState("loading"); setError("");
    try {
      const response = await fetch("/api/applications", { cache: "no-store" });
      const data = await response.json() as { application: Application | null; error?: { message: string } };
      if (response.status === 401 || response.status === 403) { setState("signin"); if (response.status === 403) setError(data.error?.message || "Verify your email to continue."); return; }
      if (!response.ok) throw new Error(data.error?.message || "Could not load your application.");
      const saved: Application | null = data.application;
      setApp(saved); setName(saved?.name ?? ""); setOrigins(saved?.origins.join("\n") ?? ""); setDocs(saved?.documentation ?? ""); setEnabled(saved?.widgetEnabled ?? false); setState("ready");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load your application."); setState("error"); }
  }
  useEffect(() => { setEmbedBase(window.location.origin); void load(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(""); setMessage("");
    const parsed = applicationInput.safeParse({ name, origins: origins.split(/\n/).map(v => v.trim()).filter(Boolean), documentation: docs, widgetEnabled: enabled, revision: app?.revision ?? 0 });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check the application settings."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/applications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json() as { application: Application | null; error?: { message: string } };
      if (!response.ok) throw new Error(data.error?.message || "Could not save your application.");
      if (!data.application) throw new Error("The application was not returned. Reload to check its status.");
      setApp(data.application); setOrigins(data.application.origins.join("\n")); setMessage(data.application.widgetEnabled ? "Saved. Your support widget is enabled on the registered websites." : "Saved. Your support widget is disabled.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save your application."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { const result = await (await authClient()).signOut(); if (result.error) throw new Error(); setApp(null); setName(""); setDocs(""); setOrigins(""); setMessage(""); setState("signin"); }
    catch { setError("Could not sign out. Try again."); } finally { setBusy(false); }
  }
  async function copyId() { if (!app) return; try { await navigator.clipboard.writeText(app.id); setCopied(true); } catch { setError("Copy is unavailable. Select the app ID and copy it manually."); } }
  return <main className={`setup ${state === "signin" ? "setup-signin" : ""}`}><header className="setup-nav"><a href="/" className="setup-logo">talo.</a>{state === "ready" && app && <><a href="/docs/agent">Integration</a><a href="/inbox">Conversations</a></>}{state === "ready" && <button className="secondary" disabled={busy} onClick={signOut}>Sign out</button>}</header>
    <div className="setup-heading"><p className="setup-kicker">YOUR WORKSPACE</p><h1>{app ? "Your application, connected." : "Make Talo yours."}</h1><p>Set up your application and give Talo the knowledge your customers need.</p></div>
    {state === "loading" && <LoadingIndicator />}
    {state === "signin" && <div className="setup-auth"><AuthPanel onSignedIn={load} /></div>}
    {state === "error" && <button onClick={load}>Retry loading</button>}
    {state === "ready" && <div className="setup-grid"><form onSubmit={save} className="setup-form"><section><p className="setup-kicker">01 / APPLICATION</p><label htmlFor="app-name">Application name</label><input id="app-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} required placeholder="Your product name" disabled={busy}/><label htmlFor="app-origins">Allowed website origins</label><textarea id="app-origins" value={origins} onChange={e => setOrigins(e.target.value)} required rows={3} placeholder={'https://app.example.com\nhttp://localhost:3000'} disabled={busy}/><p className="setup-help">One origin per line, up to five. Use HTTPS, or HTTP for local development. Paths and wildcard domains are not accepted.</p></section><KnowledgeInput value={docs} onChange={setDocs} disabled={busy} /><section><label className="setup-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} disabled={busy}/> Enable the public support widget</label><p className="setup-help">Enabling publishes this documentation for customer answers and sends questions, recent conversation context, and documentation to OpenAI when available. Only publish content intended for anyone to read. Allowed origins limit browser embedding; they are not customer authentication. Turn this off and save to stop new widget requests.</p></section><button disabled={busy} aria-busy={busy}>{busy && <ButtonSpinner />}{busy ? "Saving" : app ? "Save changes" : "Create application"}</button></form>
    <aside className="setup-summary">{app && embedBase && <AgentSetup appId={app.id} base={embedBase} />}<p className="setup-kicker">03 / YOUR APP ID</p><h2>{app ? "Ready for the next step." : "Your integration starts here."}</h2>{app ? <><label htmlFor="public-app-id">Public application ID</label><input id="public-app-id" value={app.id} readOnly/><button className="secondary" onClick={copyId}>{copied ? "Copied" : "Copy app ID"}</button><p className="setup-help">This identifies your application. It is not a secret key and does not grant access to private data.</p><dl><div><dt>Application</dt><dd>{app.name}</dd></div><div><dt>Allowed origins</dt><dd>{app.origins.length}</dd></div><div><dt>Support content</dt><dd>Saved</dd></div></dl></> : <p>Create your application to get a stable public ID. You can update its domains and documentation here later.</p>}<div className="setup-next"><b>Install the support widget</b>{app && embedBase ? <><p>Add this before the closing body tag on an allowed website.</p><pre className="setup-snippet"><code>{`<script src="${embedBase}/widget.js"
  data-app-id="${app.id}" defer></script>`}</code></pre><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(`<script src="${embedBase}/widget.js" data-app-id="${app.id}" defer></script>`); setSnippetCopied(true); } catch { setError("Select the snippet and copy it manually."); } }}>{snippetCopied ? "Copied" : "Copy embed snippet"}</button><p className="setup-help">Status: {app.widgetEnabled ? "Enabled" : "Disabled - enable the widget and save first"}. This widget answers from the saved documentation. Anonymous sessions stay in the open tab. Connect server identity below for opt-in returning-customer memory and read-only account facts.</p></> : <p>Save your application to get its installation snippet.</p>}<a href="/docs/widget">Read the integration guide</a></div>{app && <ServerSetup />}</aside></div>}
    {message && <p className="setup-status" role="status">{message}</p>}{error && <div className="error" role="alert"><p>{error}</p>{state === "ready" && <button className="secondary" disabled={busy} onClick={load}>Reload saved application</button>}</div>}
  </main>;
}
