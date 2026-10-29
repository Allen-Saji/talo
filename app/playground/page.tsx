import SupportPanel from "../support-panel";

export default function Home() {
  return <main className="container">
    <header><a href="/" className="wordmark">talo</a><span className="badge">Synthetic support demo</span></header>
    <section className="intro"><p className="eyebrow">Support that remembers</p><h1>Pick up where you left off.</h1><p>Investigate a payment and access issue without repeating the steps you already tried.</p></section>
    <p className="notice">This demo uses synthetic invoices and app-access scenarios. It checks a historical Sui transfer through Tatum and can remember your structured reports in Walrus. Replies use OpenAI when available, with a deterministic fallback.</p>
    <SupportPanel />
  </main>;
}
