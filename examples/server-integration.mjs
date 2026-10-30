/** Call only after your backend has authenticated and authorized this customer. */
export async function createTaloSession({ customerId, facts = {} }) {
  const { TALO_URL, TALO_APP_ID, TALO_SERVER_KEY, TALO_CUSTOMER_ORIGIN } = process.env;
  if (!TALO_URL || !TALO_APP_ID || !TALO_SERVER_KEY || !TALO_CUSTOMER_ORIGIN) throw new Error('Talo server integration is not configured.');
  const response = await fetch(new URL('/api/server/sessions', TALO_URL), {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${TALO_SERVER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: TALO_APP_ID, customerId, origin: TALO_CUSTOMER_ORIGIN, facts }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Talo support session could not be created.');
  return response.json();
}
