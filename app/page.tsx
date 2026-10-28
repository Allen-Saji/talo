export default function Home() {
  return <main className="container">
    <header><a className="wordmark" href="/">talo</a><span className="badge">Local runtime</span></header>
    <section className="intro"><h1>Talo</h1><p>The application is running in local Cloudflare Workers. Provider integrations are not connected.</p></section>
    <a href="/api/hello">Check the server route</a>
  </main>;
}
