/** Talo connection checks. No file writes, chat messages, or credential output.
 * Inspect this file before running. Node 22+: node --env-file=.env.local ./talo-check.mjs
 */
export async function checkTalo(env, request = fetch) {
  const { TALO_URL, TALO_APP_ID, TALO_CUSTOMER_ORIGIN, TALO_SERVER_KEY, TALO_TEST_CUSTOMER_ID } = env;
  function origin(value) {
    try {
      const u = new URL(value);
      if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw Error();
      return u.origin;
    } catch { throw Error('Use an HTTPS origin (or HTTP localhost), with no credentials, path, query or fragment.'); }
  }
  const base = origin(TALO_URL);
  const customerOrigin = origin(TALO_CUSTOMER_ORIGIN);
  if (!/^app_[0-9a-f-]{36}$/.test(TALO_APP_ID ?? '')) throw Error('Set TALO_APP_ID to the public application ID.');
  async function call(path, init = {}) {
    let response;
    try { response = await request(base + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw Error('Connection failed. Check TALO_URL and network access. Redirects are not followed.'); }
    if (!response.ok) {
      const hints = {401:'Check the backend key.',404:'Check the application ID and enable the widget in the dashboard.',403:'Enable the widget and register the exact customer origin.',429:'Daily cap reached. Stop and wait; do not reset counters.',503:'Talo is unavailable. Try later.'};
      throw Error(`HTTP ${response.status}. ${hints[response.status] ?? 'Check the configuration and API schema.'}`);
    }
    return response;
  }
  const config = await call('/api/widget/config?appId=' + encodeURIComponent(TALO_APP_ID), { headers: { Origin: customerOrigin } });
  if (config.headers.get('Access-Control-Allow-Origin') !== customerOrigin) throw Error('The widget origin response did not match.');
  let data;
  try { data = await config.json(); } catch { throw Error('Widget configuration was not valid JSON.'); }
  if (typeof data.sessionToken !== 'string' || !data.sessionToken || typeof data.name !== 'string') throw Error('Widget configuration was incomplete.');
  const results = ['PASS: Widget enabled and customer origin accepted.'];
  if (TALO_TEST_CUSTOMER_ID) {
    if (!TALO_SERVER_KEY) throw Error('Set TALO_SERVER_KEY for the explicit synthetic session check.');
    if (TALO_TEST_CUSTOMER_ID.length > 200) throw Error('Synthetic customer ID must be at most 200 characters.');
    const response = await call('/api/server/sessions', { method:'POST', headers:{Authorization:`Bearer ${TALO_SERVER_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({appId:TALO_APP_ID, customerId:TALO_TEST_CUSTOMER_ID, origin:customerOrigin}) });
    let session;
    try { session = await response.json(); } catch { throw Error('Session response was not valid JSON.'); }
    if (typeof session.token !== 'string' || !session.token || session.expiresIn !== 900) throw Error('Session response was incomplete.');
    results.push('PASS: Backend key accepted; one synthetic support session issued.');
  } else results.push('SKIP: Backend identity check. Set TALO_TEST_CUSTOMER_ID explicitly to enable it.');
  results.push('NEXT: Verify the host authentication and widget in your browser. Connection checks alone do not prove customer isolation.');
  return results;
}
// Importable for tests; execution is opt-in via the script entry point.
if (typeof process !== 'undefined' && process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { for (const line of await checkTalo(process.env)) console.log(line); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
