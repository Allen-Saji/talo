"use client";
import { useState } from "react";
export default function AgentSetup({ appId, base }: { appId: string; base: string }) {
  const [notice, setNotice] = useState("");
  const link = `${base}/agent/setup?appId=${encodeURIComponent(appId)}`;
  const prompt = `Integrate Talo into this project. Read ${link} and follow the setup guide. Inspect this project's framework and authentication, install the widget, configure the environment, and verify it in the browser. For verified customer memory, use my existing backend auth and the TALO_SERVER_KEY in my server environment. Never print or commit secrets. Tell me what you verified and anything still needed.`;
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice("Copied. Paste it into your coding agent."); } catch { setNotice("Select and copy the text below."); } }
  return <section className="setup-next agent-setup"><p className="setup-kicker">SET UP WITH YOUR AGENT</p><h3>One link. Your own codebase.</h3><p>Give your coding agent these instructions. It can add the widget, wire your existing authentication, and check the connection.</p><textarea aria-label="Agent setup prompt" readOnly value={prompt} rows={6} /><div className="memory-actions"><button type="button" onClick={() => void copy(prompt)}>Copy agent setup</button><button type="button" className="secondary" onClick={() => void copy(link)}>Copy link</button></div><p className="setup-help">The link includes only your public app ID. For customer memory, generate a backend key below and add it to your server environment. Keep it out of the prompt.</p><a href="/docs/agent">How agent setup works</a>{notice && <p role="status" className="setup-help">{notice}</p>}</section>;
}
