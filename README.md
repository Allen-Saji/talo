# Talo

An embedded support assistant that remembers previous troubleshooting attempts,
checks current facts, and prepares a useful handoff when an issue remains open.

The homepage introduces Talo. `/dashboard` lets verified users create one
application per personal workspace, register up to five exact website origins,
and save up to 50,000 characters of support documentation. Each application gets
a stable public ID. Settings are private, scoped by server-derived identity, and
protected against stale concurrent edits.

The embeddable widget is available at `/widget.js`. Enable it explicitly in the
dashboard to publish support content, then copy the generated script tag into
an allowed website. Answers use that application's documentation with an exact
source excerpt. The server session API and agent setup guide cover verified customer identity.

`/playground` contains the existing support demonstration with Neon case storage,
Walrus memory, and optional OpenAI `gpt-6-luna` answers. It checks a historical
Sui transfer against a synthetic invoice; it does not establish that a user paid
Talo. Model failures fall back to a deterministic answer.

## Run locally

Use Node 24.22.1 and pnpm 10.8.1. The project pins Node in `.nvmrc`.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm cf:typegen
pnpm dev --host 127.0.0.1
```

Open http://127.0.0.1:5173 for the homepage. Visit `/playground` to choose a demo customer and investigate the seeded access
issue. Alex and Sam belong to the same synthetic organization; Jules belongs to
another. Each signed session can retrieve only its own case and billing record.

For local fixture testing, leave `TALO_PUBLIC_AUTH=false`. The fixture selector
is restricted to loopback hostnames and explicit demo mode. Public mode disables
that selector and its identity-issuing endpoint, including on localhost.

### Public sign-in

`neon.ts` enables Managed Better Auth on the linked branch. Run `neon deploy`,
then configure these server-only values in `.dev.vars`:

- `TALO_PUBLIC_AUTH=true`
- `NEON_AUTH_BASE_URL` from Neon (also synchronized during build)
- `NEON_AUTH_COOKIE_SECRET`, a separately generated random value of at least 32 characters

Configure email/password sign-up with email-code verification required, and
allowlist the app's exact origin with `neon neon-auth domain add <origin>`.
The UI offers Continue with Google first, with email/password signup, code
verification/resend, password reset, and sign-out as alternatives. Google uses
Neon shared OAuth credentials for hackathon testing and shows Neon branding;
configure your own Google OAuth app before production. Middleware on the homepage, dashboard, and playground exchanges
Neon OAuth callback verifiers through the official SDK. Every protected API checks the managed session against the auth service
without trusting the session-data cookie cache. Unverified users are rejected.

Each verified identity receives a private workspace. Visiting the playground
creates a separate synthetic support case.
Tenant, user, and case IDs are derived on the server; signup cannot select an
existing customer or join another tenant. Account names are stored in Postgres;
emails and passwords are handled by Neon Auth and are not sent to Walrus/OpenAI.

The shared Neon email sender is suitable for hackathon testing. Configure your own
SMTP sender before a production launch. Email-code delivery should be checked
with an address you control; automated tests use reserved-domain accounts and do
not prove delivery. See [Neon's checklist](https://neon.com/docs/auth/production-checklist).

To test production output in the actual local Workers runtime:

```sh
pnpm build
pnpm start --port 5173 --ip 127.0.0.1
```

Use one server at a time. Rebuild and restart the production preview after source
changes. The Vite development server reloads changes automatically.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
# With a local fixture-mode Worker (TALO_PUBLIC_AUTH=false):
pnpm test:smoke
pnpm check:providers
# With a public-auth preview:
pnpm check:auth
```

Unit tests cover session tampering and expiry, user/tenant isolation, request
validation, diagnostics access, error redaction, and memory completion semantics.
The HTTP smoke script checks the built application through Workers. The default
provider command tests SDK imports and reports missing configuration without
requesting live provider calls.

## Provider configuration

`pnpm setup:local` creates a gitignored `.dev.vars` with random local session and
diagnostic secrets. It preserves an existing file. Consult `.dev.vars.example`
when adding provider settings locally. Never put credentials in client code,
public variables, source control, or diagnostic output.

Neon CLI writes its credentials into `.env.local`, or `.env` when that file
already exists. On Vite startup/build, the app copies `DATABASE_URL` and `NEON_AUTH_BASE_URL` into
the ignored `.dev.vars` used by Workers. Other local settings are preserved.
The direct migration URL stays in the Neon environment file. These files are
local credentials, not deployment configuration; set `DATABASE_URL` as a
Cloudflare secret separately when deploying the Worker.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection used only by schema migrations |
| `TATUM_API_KEY` | Tatum gateway credential |
| `TATUM_TRANSACTION_DIGEST` | Known Mainnet transaction for a read-only probe |
| `MEMWAL_PRIVATE_KEY` | Walrus Memory delegate key |
| `MEMWAL_ACCOUNT_ID` | Corresponding Mainnet Memory account ID |
| `MEMWAL_SERVER_URL` | Managed Mainnet relayer, `https://relayer.memory.walrus.xyz` |
| `TALO_PUBLIC_AUTH` | Enable public Neon Auth; disables fixture identity issuance |
| `NEON_AUTH_BASE_URL` | Managed authentication service URL |
| `NEON_AUTH_COOKIE_SECRET` | Random server-only auth cookie signing secret |
| `OPENAI_API_KEY` | Optional server-side OpenAI Responses credential |
| `SESSION_SECRET` | At least 32 characters for local signed sessions |
| `DIAGNOSTICS_TOKEN` | At least 32 characters for local diagnostic access |

After configuring credentials, restart the server. For a production preview,
rebuild first because the adapter copies local variables into ignored build
output. Request read-only live checks explicitly:

```sh
pnpm check:providers --live
# Test only Neon when other providers are not configured:
pnpm check:providers --live --provider=neon
```

The live checks run a Neon read-only batch, a Tatum gRPC-web transaction read, and
an authenticated Walrus recall in a reserved synthetic namespace. Tatum reads need
Cloudflare's edge gRPC conversion, described below. Empty recall can verify authenticated access
but does not prove memory persistence. No diagnostic endpoint uploads memories.

### Walrus Memory setup

In the [Walrus dashboard](https://memory.walrus.xyz/dashboard), select
"Connect an app" and use the JavaScript SDK credentials. Put the account ID and
delegate private key in ignored `.dev.vars` as `MEMWAL_ACCOUNT_ID` and
`MEMWAL_PRIVATE_KEY`. Use the delegate key, not a wallet recovery phrase or the
delegate public key. The SDK is already installed. Keep the private key on the
server and out of chat, source control, and browser assets.

After rebuilding/restarting the local Worker, test authenticated read access:

```sh
pnpm check:providers --live --provider=walrus
```

An empty successful recall proves access but does not prove stored memory. To
test persistence explicitly, these commands write one synthetic Mainnet record
in the reserved `talo-compatibility` namespace and verify it from a fresh process:

```sh
pnpm check:memory write
pnpm check:memory verify
pnpm check:providers --live --provider=walrus --expect-memory-probe
```

`write` retains its job reference in ignored `.wrangler/talo-memory-check.json`
and uses a stable idempotency key. It does not write again when a reference is
already present. `verify` checks completed status, namespace, blob reference,
and an exact text/blob match on recall. Exit code 2 means the job is still
submitted: rerun `verify`, rather than submitting another record. No check
deletes memories. If you use port 5174, prefix commands with
`TALO_LOCAL_URL=http://127.0.0.1:5174`.

The support panel can explicitly save one of three structured preferences and
allowlisted troubleshooting steps with a reported outcome. It never uploads the
question or a raw transcript. The server derives tenant/user
scope, verifies case ownership, and enqueues an immutable event in Neon. Reusing
an event ID with different content returns 409. Each preference expires from
application eligibility after 30 days. New events share a global 50-per-UTC-day
cap; retries with an existing event ID do not allocate another event. Reservations
may consume a slot even if a subsequent database write fails.

Deploy the separate scheduled dispatcher with an ignored, owner-only
`.wrangler/memory-dispatch-secrets.json` containing `DATABASE_URL`,
`MEMWAL_PRIVATE_KEY`, `MEMWAL_ACCOUNT_ID`, and `MEMWAL_SERVER_URL`:

```sh
pnpm exec wrangler deploy --config wrangler.memory-dispatch.jsonc --secrets-file .wrangler/memory-dispatch-secrets.json --minify
```

It has no public endpoint. Each scheduled invocation claims at most five jobs
with expiring database leases, submits with stable idempotency keys, and polls
known provider jobs. The database preserves work across restarts. A completed
receipt must match the expected job, namespace, and blob. After 20 attempts,
unfinished jobs stop retrying with `RETRY_EXHAUSTED`; inspect their provider state
before explicitly resuming them. Deployment of a cron trigger can take time to
propagate; enqueued work remains in Neon meanwhile.

Recall uses the newest eligible preference and newest report for each attempt
step in the owned case and requires an
exact text/blob match with its saved database reference. Unknown references,
expired or suppressed rows, and another user's memories are excluded. A newer
pending preference prevents fallback to an older saved preference. "Stop using
saved preferences" changes application eligibility; it does not delete provider
records or cancel a provider write already in flight. The managed relayer sees
plaintext; these synthetic preferences are not end-to-end private.

`wrangler.memory-probe.jsonc` is an optional authenticated compatibility probe.
Its secrets file needs the three `MEMWAL_*` values, a separate random
`PROBE_TOKEN` of at least 32 characters, and `PROBE_JOB_ID`/`PROBE_BLOB_ID` from
the original setup check. POST `/write` retries only that fixed synthetic text
and original key; POST `/verify` checks completion and exact recall. Neither
endpoint accepts caller-supplied content.

For the live local-app flow, with the dispatcher running:

```sh
TALO_LOCAL_URL=http://127.0.0.1:5175 pnpm check:memory:flow enqueue
TALO_LOCAL_URL=http://127.0.0.1:5175 pnpm check:memory:flow verify
```

`enqueue` saves one synthetic Alex preference and retains its event reference
under ignored `.wrangler/`. `verify` checks the database receipt, scoped Walrus
recall, and one OpenAI answer; exit 2 means the dispatcher has not saved it yet.
The optional `suppress` command stops using this case's preferences.

`pnpm check:memory:jobs` requires an isolated Neon branch connection in ignored
`.env.memory-schema-check`. It tests dispatch races and recovery using fake
provider responses, and exercises the database model-attempt cap without calling
OpenAI. Do not point this test at production; it resets the isolated branch's
daily usage counter.

### OpenAI support answers

Put `OPENAI_API_KEY` in ignored `.dev.vars`, then rebuild/restart. Talo calls the
Responses API with `gpt-6-luna`, strict structured output, `store: false`, no
action tools, a bounded context, and at most 800 output tokens. Input is the
user's question plus the owned synthetic case and verified preference. A global
Neon counter allows at most 20 attempts per UTC day. Failures and timeouts count;
there are no automatic paid retries. This is an attempt cap, not a dollar budget.
If configuration, quota, validation, or a provider call fails, the app returns its
deterministic answer and labels the generation mode. The model cannot change
access, send a ticket, or write memory.

### Attempts and reviewed lessons

Attempt records are customer reports, not proof of current payment or access.
A newer pending report hides an older outcome for the same step. Retrieval checks
owned case, eligibility, provider account, namespace, completed receipt, and exact
text/blob identity before including a report in an answer.

A saved report that switching workspaces or reopening the mobile app resolved an
issue can be proposed as a lesson. The candidate contains only an allowlisted,
redacted template, not raw customer text. An operator visits `/review` to mark the
candidate redacted, approve it, or retire it. These are explicit human actions.
Approval atomically creates a durable publication job and retires the previous
approved lesson for that tenant/code. Unapproved, unsaved, expired, suppressed,
retired, or wrong-version lessons cannot enter model context. Suppressing the
source record also blocks the shared lesson. Sharing never crosses tenants.

Set `TALO_OPERATOR_EMAILS` to exact verified account emails or `TALO_OPERATOR_IDS`
to server-side user IDs. Role claims come from the verified session, never request
JSON. Operators still need membership in the lesson's tenant. Each public account
currently has its own workspace, so sharing between multiple public accounts
requires an explicit future membership/invitation feature.

`pnpm check:lessons` verifies review states, races, scope, and suppression on the
isolated Neon branch, without writing to Walrus. Actual live lesson publication
requires an operator's review and approval.

### Historical sample invoice

`lib/payments/sample.json` binds the demo to one historical public Sui Mainnet
transfer and exact expected fields. Each owned synthetic case replays this same
sample; no real invoice is settled and no balance or entitlement changes.

The supported pattern is exactly one gas-coin split and one transfer to a single
recipient. The matcher checks digest binding, chain/network, successful checkpointed
execution, timestamp window, sender, recipient, canonical SUI coin type, exact u64
amount, and consistent balance changes. Other transaction shapes are ambiguous.
Amounts remain integer strings/BigInt throughout. This narrow demo does not claim
to support arbitrary swaps, sponsored transactions, stablecoin checkouts, or refunds.

The app calls Tatum from the deployed edge, caches only the public chain observation
for five minutes, and caps fresh reads at 100 per UTC day globally. Missing or stale
unrefreshable evidence becomes unverified, never a fixture match. Invoice-match,
chain execution, and synthetic app access remain separate in the response and UI.
Historical data can be pruned by providers; replacing the sample is a reviewed code
change, not an automatic reassignment of a customer's payment.

`pnpm check:continuity enqueue` checks the Tatum result against the official Sui
node and enqueues one synthetic failed attempt. `pnpm check:continuity verify`
checks durable completion, exact attempt/preference recall, and the sample match.
Existing test references are reused from ignored local state.

### Tatum on Cloudflare's edge

Tatum's Sui endpoint serves native gRPC. The adapter explicitly requests
Cloudflare conversion with `fetchInit.cf.grpcWeb = "convert"` and disables
redirects. Local workerd and plain Node fetch do not perform this edge conversion;
a local Tatum diagnostic can fail even when the deployed edge check passes.

`wrangler.tatum-probe.jsonc` deploys a separate protected probe that uses the same
adapter as the app. It accepts only an authenticated `POST /check`, reads only
the configured transaction, and never accepts caller-supplied digests. It does
not open the app's local-only authentication or diagnostics routes.

Create an ignored, owner-only `.wrangler/tatum-edge-secrets.json` with
`TATUM_API_KEY`, `TATUM_TRANSACTION_DIGEST`, and a separately generated random
`PROBE_TOKEN` of at least 32 characters. Deploy to your selected account:

```sh
pnpm exec wrangler deploy --config wrangler.tatum-probe.jsonc --secrets-file .wrangler/tatum-edge-secrets.json --minify
npm run check:tatum:edge -- https://talo-tatum-probe.<your-subdomain>.workers.dev
```

Set the same recent, confirmed public digest as `TATUM_TRANSACTION_DIGEST` in
local configuration. Public full nodes may prune older transaction data.
The check rejects unauthenticated requests, reads through the deployed Worker,
and independently compares chain identity, digest, sender, execution, and
checkpoint against Sui's public Mainnet full node. It saves public-chain proof
under ignored `.wrangler/`. The Tatum API key is sent only to Tatum; the probe
token is sent only to the configured probe. A chain read does not establish
invoice attribution. Account support for edge conversion must be verified by
this check before relying on it.

## Database

Drizzle defines tenants, users, memberships, support cases, and memory-job records.
Runtime queries use the existing Neon HTTP driver, which supports one-shot edge
queries and batched transactions without a TCP pool. Migration commands use the
direct connection with a WebSocket transaction.

To connect a Neon project, authenticate with `neon login`, then run from the
project root (replace the IDs with your own):

```sh
neon init -y --agent codex --package-manager pnpm --org-id <org-id> --project-id <project-id> --branch production --services postgres
neon deploy
```

`neon.ts` manages Postgres and Managed Auth while preserving existing branch settings. Test
migrations against a separate Neon branch before applying them to production.
With `.neon` linked to the intended branch and credentials downloaded:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm start --port 5173 --ip 127.0.0.1
# In another terminal:
pnpm test:smoke --neon
```

Generation needs no credentials. Migrations require `DATABASE_URL_UNPOOLED` and
apply the checked-in SQL through Drizzle. Seeding inserts three synthetic cases
and their users/tenants/memberships in one transaction, preserving existing rows.
It does not create Walrus memories or verify any payment.

Support and billing filter every case read by the signed session's user and
tenant. Without `DATABASE_URL`, the local demo uses in-memory fixtures. When a
database is configured, missing data returns 404 and database failures return a
safe error; neither condition silently falls back to fixtures.

## Stack and deployment

- React and TypeScript, using App Router conventions.
- vinext and Vite, targeting Cloudflare Workers with Node compatibility enabled.
- Neon and Drizzle for application case persistence.
- Mysten Sui gRPC-web and Walrus Memory behind server-side adapters.

vinext reimplements Next.js APIs and is under active development. This app uses
its Worker runtime rather than stock Next.js server output. Cloudflare hosting,
production credentials, and any paid plan must be configured separately. The
repository includes a deployment command but does not deploy during setup or
verification. For public deployment, set `TALO_PUBLIC_AUTH=true`, disable local demo mode and
diagnostics, configure the auth cookie secret and trusted origin, and supply only
the required server secrets. Keep the shared email sender limited to hackathon
testing. The static asset directory must be `dist/client`, never `dist/server`.

`pnpm check:auth` exercises public auth against the local preview. It stores
synthetic test credentials in ignored `.wrangler/public-auth-check.json`. Only
new reserved-domain test identities are marked verified by the setup script so
session and isolation checks can run; real email verification is not bypassed by
any application endpoint. The test includes one bounded OpenAI generation.
The main app uses a historical chain observation with a synthetic invoice and
access scenario; it does not authorize money movement or entitlement changes.

See [architecture](docs/architecture.md) for request boundaries, provider status,
and the remaining production provider configuration and broader checkout support.

## Email flow checks

`pnpm check:auth:mail start|resend|verify|reset-request|reset-complete` uses an
explicitly supplied plus-address containing `+talo-auth-` for a disposable account.
It will not reset a normal account. Passwords and state are stored only in ignored
owner-only `.wrangler/` files. Supply codes through stdin or the ignored local
`auth-check-code.txt` file; they are not logged. The shared sender remains a
hackathon setting. Production requires a custom SMTP sender and Talo-owned Google
OAuth credentials, configured in Neon rather than browser code.

## Application onboarding checks

`pnpm exec tsx scripts/check-applications.ts` applies migrations and tests storage
isolation on the separate database in `.env.memory-schema-check`. It refuses the
production database. `pnpm exec tsx scripts/check-onboarding-http.ts` checks the
local server at port 5175 using existing synthetic accounts in the ignored
`.wrangler/public-auth-check.json`; it sends no signup or verification emails.
The local HTTP test saves a synthetic application in that test account.

Apply migrations with `pnpm db:migrate` before running the new dashboard.
Application origins enforce browser embedding checks, not customer authentication.
Non-browser callers can forge Origin, so enabling the widget publishes the
support documentation for public answers. Drafts remain unavailable to the widget.
Documentation is stored as plain text; no arbitrary URLs are fetched. Published
documentation, questions, and recent conversation history are sent to OpenAI
when generation is available.

## Embedded widget

1. Register the exact website origin in `/dashboard`.
2. Add customer-facing support content and explicitly enable the widget.
3. Copy the embed snippet from the dashboard into the website before `</body>`.
4. Open the widget and ask a question covered by the guide.

The script uses a shadow root for style isolation and renders responses with
`textContent`, never response HTML. No secret key or Talo session cookie is
sent from the host page. Read `/docs/widget` for CSP and integration details.
Anonymous widget sessions stay in the open tab. Verified backend-issued sessions
support opt-in last-three-exchange memory across visits and read-only account facts.
Conversation history is loaded from server records, not browser-supplied history.

The public endpoint checks the saved app ID, enabled state, and exact Origin
on each request, including preflight. Each app has a 100-request UTC-day cap.
Model attempts share the existing global 20/day cap. Failures and exhausted
model capacity fall back to a matching documentation excerpt, not a fabricated
AI response. Origin checks are not proof of customer identity.

Run `pnpm check:widget` against local port5175 using the existing synthetic auth
account. This test publishes synthetic content only, restricts it to
`http://127.0.0.1:5178`, verifies responses and disable/re-enable, and saves the
public app ID to ignored `.wrangler/widget-check-result.json`.
Serve `examples/widget-host` on port5178 and open `/?appId=<public-app-id>` to
verify installation on a separate origin. The sample host is a test fixture,
not a replacement for the product homepage. Apply migration0007 before use.

## Customer identity, memory, and team inbox

Generate a server key in `/dashboard`. Keys are shown once and stored as hashes;
rotation invalidates the previous key and verified widget sessions. Your backend
must authenticate the customer itself, then call `POST /api/server/sessions`
without an Origin header and with `Authorization: Bearer <server-key>`.
Provide the public app ID, trusted customer ID, registered origin, and optional
allowed account facts. Tokens last 15 minutes, are scoped to app/customer/origin,
and contain readable facts: never put secrets in them.

Use `window.Talo.identify(token)` after `talo:ready` and clear identity on logout.
The examples in `/docs/server` and `examples/server-integration.mjs` show the
contract. `/llms.txt` is an agent-readable setup brief; `/openapi.json` describes
the server endpoint. Neither substitutes for the host application's authentication.

Verified users can remember their last three exchanges for 30 days. Widget memory
uses scoped Neon records; it is separate from the playground's Walrus jobs.
Forget clears saved context. Support conversation records have their own 30-day
expiry and remain visible to the owning application through `/inbox`. Customers
can request a handoff and check for a team reply. Operators can reply and resolve
threads. No email/Slack delivery or proactive notification is implemented.

The existing scheduled Worker purges expired widget memory and conversation rows
hourly in batches of500; reads reject expired rows immediately. Private account
facts are read-only snapshots supplied by the backend (plan, subscriptionStatus,
accountStatus, supportEmail), not actions or direct billing-provider connectors.

Verification: `pnpm exec tsx scripts/check-customer-continuity.ts` uses the isolated
Neon database; `pnpm exec tsx scripts/check-customer-http.ts` uses existing synthetic
accounts against localhost5175. It generates/rotates only the synthetic application's
server key and stores it in ignored `.wrangler/widget-identity-check.json` for the
local backend fixture. Use `TALO_LOCAL_URL` only for the explicitly allowed public
Worker URL when testing deployment. Apply migration0008 before deploying this code.

### Set up with a coding agent

After creating and enabling an application, choose **Copy agent setup** in the dashboard. The copied prompt links to `/agent/setup?appId=...`, a public Markdown runbook containing the public application ID and implementation/verification steps. Backend credentials stay in the host environment, never in the link. `/docs/agent` explains the flow. The downloadable `/integrations/check.mjs` checks widget configuration and optionally one explicit synthetic server session; it does not install code or prove host authentication.

### Knowledge imports and safety

The dashboard accepts pasted text, one public HTTPS page at a time, and PDF/Markdown/text documents. Files are limited to 2 MB; PDFs to 25 pages. PDF.js extracts text in the browser without a viewer, scripting layer, or rendering. Original files are not uploaded or retained. Only extracted text is sent for checks. Scanned PDFs/OCR, Word files, login-protected pages, query-string URLs and automatic whole-site crawling are not supported. Knowledge is capped at 50,000 characters; models receive up to 8,000 characters of ranked passages.

Imports require a verified account and same-origin requests, with 30 import/check requests per account per UTC day. Review and edit extracted text before adding it to the application draft. Saving applies the same content checks server-side, including when called outside the dashboard. Known instruction-override patterns, credentials, control characters, active markup and long encoded payloads are blocked. Detection is heuristic, not proof that a document is safe. Owners must still review accuracy and private information.

Website fetching runs in the service-binding-only `talo-knowledge-import` Worker with no secrets, storage or private-network bindings. It rejects IP-literal/private/reserved DNS destinations, credential-bearing URLs, custom ports and redirects; it forwards no authentication or cookies, executes no JavaScript, and bounds fetch time and response size. DNS validation is not DNS pinning; the separate Worker and its lack of private access are part of the isolation boundary. Do not add private-network bindings or secrets to that Worker. Deploy it with `wrangler deploy --config wrangler.knowledge-import.jsonc` before deploying the main app that binds it.

The embedded documentation model has no tools and may only select an exact passage from the approved reference text. Free-form model prose is discarded. Verified account answers are resolved separately and account facts are not mixed into document prompts. This limits prompt-injection impact; it does not guarantee that every misleading or malicious passage is detected. Extracted sources are displayed as text, never executed HTML.

### Customer insights

Owners can open `/insights` for 7-day or 30-day UTC views of their unexpired conversations: daily volume, distinct verified customers, repeat contacts, current human-help requests, customer feedback, and topic groups with conversation evidence. Anonymous threads count toward volume but not distinct customers. At most the latest 2,000 threads are analyzed, with a visible notice when the result is truncated.

Topics use deterministic English keyword rules on the first retained question, not model-generated root-cause claims. Suggestions are fixed investigation prompts shown after three matching conversations. Customer text cannot introduce new instructions or recommendations. No geography or behavioral tracking is collected.

Widget customers can choose This helped or Still stuck after a response. Outcomes belong to that exact conversation revision; new messages and operator replies clear previous feedback. Operator resolution remains a separate workflow status. Migration 0009 adds nullable feedback fields; old conversations begin with unknown outcomes.

### Public domains

Talo is available at https://talo.allensaji.dev. The Vercel project `talo-site` uses `hosting/vercel/vercel.json` to route requests to the existing Cloudflare Worker. Deploy that directory as a static Vercel project with no build command. The apex domain and unrelated DNS records remain separate.

The auth proxy and OAuth middleware recognize only the exact custom hostname for this Worker. Keep the same hostname in Neon's trusted-domain list. Arbitrary forwarded hosts are ignored and foreign origins remain rejected. The original workers.dev address remains supported.
