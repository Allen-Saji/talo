// Local-only integration fixture. Never deploy this fixed-customer session endpoint.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const statePath = new URL('../../.wrangler/widget-identity-check.json', import.meta.url);
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:5178');
    if (url.pathname === '/support-session') {
      if (request.headers.origin && request.headers.origin !== 'http://127.0.0.1:5178') { response.writeHead(403).end(); return; }
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      const customerId = url.searchParams.get('customer') === 'bob' ? 'synthetic-bob' : 'synthetic-alice';
      const upstream = await fetch(state.base + '/api/server/sessions', {
        method: 'POST', headers: { Authorization: `Bearer ${state.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: state.appId, customerId, origin: state.origin, facts: { plan: customerId === 'synthetic-bob' ? 'Starter' : 'Pro', subscriptionStatus: 'active' } }),
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) { response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Support session unavailable.' })); return; }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(await upstream.json()));
      return;
    }
    if (url.pathname !== '/') { response.writeHead(404).end(); return; }
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html.replace('http://127.0.0.1:5175/widget.js', state.base + '/widget.js').replace('http://127.0.0.1:5175/dashboard', state.base + '/dashboard'));
  } catch { response.writeHead(503).end('Local fixture unavailable. Run the customer HTTP check first.'); }
}).listen(5178, '127.0.0.1', () => console.log('Local widget integration host: http://127.0.0.1:5178'));
