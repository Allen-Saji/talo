const serverExample=`// Run on YOUR backend, after authenticating the customer.
// Never accept customerId or account facts from the browser unchanged.
const response = await fetch(TALO_URL + '/api/server/sessions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + process.env.TALO_SERVER_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    appId: process.env.TALO_APP_ID,
    customerId: authenticatedUser.id,
    origin: 'https://your-app.example',
    facts: { plan: account.plan, subscriptionStatus: account.status }
  })
});
if (!response.ok) throw new Error('Support session unavailable');
// Return { token, expiresIn } to this signed-in customer only.
return await response.json();`;
const browserExample=`// Register this listener before loading widget.js.
window.addEventListener('talo:ready', async () => {
  const response = await fetch('/your-authenticated-support-session');
  if (!response.ok) return;
  const { token } = await response.json();
  await window.Talo.identify(token);
});
// When your customer signs out or changes account:
await window.Talo.clearIdentity();`;
export default function ServerDocs(){return <main className="container docs-page"><header><a className="wordmark" href="/">talo</a><a href="/dashboard">Application settings</a></header><nav className="docs-nav" aria-label="Integration guides"><a href="/docs/widget">Install the widget</a><a href="/docs/server" aria-current="page">Connect customer data</a><a href="/docs/agent">Agent setup</a></nav><section className="intro"><p className="eyebrow">SERVER INTEGRATION</p><h1>Know who's asking.</h1><p>Your application authenticates the customer. Talo receives a short-lived, scoped support identity and only the account facts you choose to share.</p></section><h2>1. Generate a backend key</h2><p>In your dashboard, generate a server key. Store it in a server environment variable. Talo stores only its hash. Rotating revokes the previous key and all verified widget sessions issued with it. The public widget app ID is not a server key.</p><h2>2. Create a customer session</h2><p>Call the endpoint from your backend without an Origin header. Derive customerId from your authenticated server session. Do not accept arbitrary customer IDs or facts from a request body.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:13,background:'#eee9e1',padding:20}}><code>{serverExample}</code></pre><p>Allowed facts: plan (up to 80 characters), subscriptionStatus (active, trialing, past_due, canceled, none), accountStatus (active, pending, suspended), and supportEmail. These are read-only snapshots, not permissions or payment instructions. They are included in a signed token readable by the customer and may be sent to OpenAI during support.</p><h2>3. Identify the widget</h2><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:13,background:'#eee9e1',padding:20}}><code>{browserExample}</code></pre><p>Session tokens expire after 15 minutes and are bound to your application and an exact allowed origin. Obtain a new token from your backend after expiry. Do not persist tokens in localStorage. Call clearIdentity when the signed-in customer changes. The identify method rejects changes while an answer is in flight; wait for that answer or clearIdentity on logout.</p><h2>4. Memory and team support</h2><p>Verified customers may opt in to remembering their last three exchanges for 30 days. Context is stored in Talo's scoped Neon records. This widget memory is separate from the playground's Walrus memory. Unchecking Remember or choosing Forget removes saved context. Conversation records remain available to your support team for up to 30 days and are excluded immediately on expiry, with bounded hourly purge batches.</p><p>Ask the team marks a conversation for human review. Operators can reply in the team inbox. Customers use Check for reply; verified returning customers can retrieve their most recent conversation. No email or Slack notification is sent, and no response time is promised.</p><h2>Agent setup</h2><p>Give your coding agent <a href="/llms.txt">the integration brief</a> and <a href="/openapi.json">the API schema</a>. Ask it to implement your authenticated backend route, wire the widget, and test two different customer identities. The server example is a template: your application's authentication and billing lookup must be supplied by your backend.</p></main>;}
