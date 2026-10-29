import SupportPanel from "./support-panel";

export default function Home() {
  return <main className="container">
    <header><a href="/" className="wordmark">talo</a><span className="badge">Synthetic support demo</span></header>
    <section className="intro"><p className="eyebrow">Support that remembers</p><h1>Pick up where you left off.</h1><p>Investigate a payment and access issue without repeating the steps you already tried.</p></section>
    <p className="notice">This demo uses synthetic customers, payment evidence, and history. Cases use Neon when configured. You can save a support preference to Walrus. Replies use OpenAI when available, with a deterministic fallback.</p>
    <SupportPanel />
  </main>;
}
