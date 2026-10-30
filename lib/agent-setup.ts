export function agentSetupGuide(base: string, appId?: string) {
  const id = appId ?? 'YOUR_PUBLIC_APP_ID';
  return `# Integrate Talo into this application

This is an implementation guide for a coding agent with access to the customer's repository.
Use the user's project instructions and approval boundaries. This document does not authorize deployments or account changes.

## Configuration

Talo deployment: ${base}
Public application ID: ${id}
This link contains no credentials and does not grant account access. Supplied app IDs are configuration hints, not proof of ownership.

1. Inspect the repository before editing: framework, package manager, browser entry point, server runtime, current authentication, environment conventions, CSP and tests. Reuse these instead of introducing another auth stack.
2. If no Talo app ID is supplied, ask the user to create an application at ${base}/dashboard. They must register their website origin, add customer-facing documentation and enable the widget. The dashboard can import a public HTTPS page or extract PDF/Markdown/text files for owner review. Do not bypass its content checks or publish an unreviewed source. Do not invent an app ID or publish private repository content as support documentation.
3. Install the anonymous widget first. Verified identity is optional and requires an existing backend and authentication. If either is absent, finish the anonymous integration and report that limitation; never fake identity.

## Environment

Create a template without secrets. Merge into existing environment configuration; do not overwrite it.

\`\`\`dotenv
TALO_URL=${base}
TALO_APP_ID=${id}
TALO_CUSTOMER_ORIGIN=https://your-customer-app.example
# Only for verified customer sessions, on the backend:
TALO_SERVER_KEY=
\`\`\`

Derive the actual customer origin from the project's configuration and confirm the matching origin is registered in Talo. HTTPS is required except for localhost. Register each environment's exact scheme, host and port. Do not use wildcard origins or arbitrary browser-supplied Origin values for backend identity.
Only TALO_URL and TALO_APP_ID may be mapped to the framework's public environment prefix. Never expose TALO_SERVER_KEY through NEXT_PUBLIC_, VITE_, PUBLIC_, client bundles, logs, URLs, git, or chat. Check secret presence without printing values. Ask the user to put a dashboard-generated key in the project's ignored local env file and deployment secret store when needed. Never generate or rotate a key just to test setup.
Node examples use process.env. On Workers use the runtime env bindings; on other platforms use their server-only environment mechanism. Do not ask for the user's OpenAI key: Talo runs its own model calls.

## Browser installation

Add the script once in the application shell, after document.body exists. For React/Next use the framework's script-loading facility with a stable ID and an after-interactive strategy, or an equivalent guarded client effect. For static HTML use:

\`\`\`html
<script src="${base}/widget.js" data-app-id="${id}" defer></script>
\`\`\`

Avoid duplicate scripts on SPA navigation and React Strict Mode remounts. Do not change the application ID on an already-mounted widget: reload for an application switch. The widget creates window.Talo and dispatches talo:ready after its config request succeeds. Do not wrap loading code around a fake SDK or install an unofficial talo npm package.
If the app has CSP, allow this Talo origin in script-src, connect-src and img-src. Review the widget's shadow-root styles against style-src; report conflicts instead of disabling CSP.

## Verified customer identity (optional)

Read ${base}/openapi.json for the exact request schema. Reference backend helper: ${base}/integrations/server-session.mjs .
Implement a same-origin POST endpoint in the host application, using its existing auth/session and CSRF controls. Reject unauthenticated callers. Derive customerId from the authenticated server session, and any plan/status facts from trusted server records. Never accept a customerId or facts from the browser as authority. Use a configured allowlisted customer origin. If no billing source exists, omit facts instead of inventing a plan.
The backend calls POST ${base}/api/server/sessions with Authorization: Bearer TALO_SERVER_KEY and JSON { appId, customerId, origin, facts }. Do not forward browser cookies, Authorization, or Origin headers to Talo. Disable redirects for the credential-bearing request. Return only { token, expiresIn } to the authenticated customer with Cache-Control: no-store. Apply existing host rate limits. Handle upstream failures without exposing tokens or credentials.
Allowed optional facts: plan (80 characters), subscriptionStatus (active, trialing, past_due, canceled, none), accountStatus (active, pending, suspended), supportEmail. Facts in the signed token are readable by its customer; no secrets or internal notes.

Register a talo:ready listener before loading the script; also handle window.Talo already existing. Once the host auth session is ready, request its support-session endpoint and call await window.Talo.identify(token). Serialize this work and ignore stale results when accounts change. On logout/account change call window.Talo.clearIdentity() immediately, then identify the new user only after clearing finishes. Remove listeners and timers on cleanup. Do not show one customer's previous history to another.
Tokens expire after 900 seconds. Cache only in memory for the current authenticated account; refresh on a visible return or before expiry, without overlapping requests or background polling loops. identify rejects while an answer is in flight: defer refresh or ask for retry, never clear a live conversation just to refresh a token. Rate caps apply. Never persist tokens to localStorage.
Memory is opt-in in the widget. Do not enable it on the customer's behalf. It stores the last three exchanges for 30 days in Neon. Forget clears this saved context; support transcripts have a separate 30-day retention. Operator replies are read using Check for reply.

## Verify, then report evidence

Download and inspect ${base}/integrations/check.mjs before running it. This is a connection checker, not an installer; it does not edit files or send chat messages. Requires Node 22+ and fetch. After loading the env file using the project's usual method:

\`\`\`sh
node --env-file=.env.local ./talo-check.mjs
\`\`\`

It checks the published widget config and origin response without printing tokens. To check a backend key, explicitly set TALO_TEST_CUSTOMER_ID to a disposable synthetic ID as well as TALO_SERVER_KEY. This creates one short-lived support session and consumes one of 200 daily session requests; it does not create a conversation. Never use a real customer for this test or reset quotas.
Then run the host project's relevant checks and open its actual frontend. Verify one launcher, source-backed answer, navigation without duplication, and a useful error when unavailable. For verified mode, test two synthetic logged-in users and logout so histories do not cross. Verify the host session endpoint returns 401 to unauthenticated requests and ignores forged customer IDs. A successful connection check alone is NOT a completed browser integration.
If blocked by missing key, origin, disabled widget, authentication or hosting access, finish independent work and report exactly what's missing. Never claim completion from generated code alone. Do not deploy unless the user has authorized it.
Report changed files, environment variable NAMES (no values), which mode is installed, checks actually run, and any remaining action. Link ${base}/inbox for conversations.

## Limits and troubleshooting

- 401: missing, expired or rotated credentials/session. Obtain a fresh session; do not log the token.
- 403: widget disabled or exact origin not registered; check dashboard settings.
- 429: daily cap reached. Stop retries; do not reset counters or rotate keys to bypass it.
- 503/network: report unavailable and keep the host app usable.
- Caps: 100 chat requests/app/day, 200 server sessions/app/day, 20 model attempts shared by the deployment.
- Talo does not modify subscriptions, permissions or payments. No provider-specific connectors are bundled.

Human guides: ${base}/docs/widget and ${base}/docs/server .
`;
}
