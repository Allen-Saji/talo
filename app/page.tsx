import SupportPanel from "./support-panel";

export default function Home() {
  return <main className="container">
    <header><a href="/" className="wordmark">talo</a><span className="badge">Local fixture mode</span></header>
    <section className="intro"><p className="eyebrow">Support that remembers</p><h1>Pick up where you left off.</h1><p>Investigate a payment and access issue without repeating the steps you already tried.</p></section>
    <p className="notice">This local build uses synthetic customers, payment evidence, and memory. Replies are deterministic. Live integrations and persistent memory are not connected.</p>
    <SupportPanel />
  </main>;
}
