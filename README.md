# Talo

An embedded support assistant that remembers previous troubleshooting attempts,
checks current facts, and prepares a useful handoff when an issue remains open.

This repository currently provides a local fixture demonstration and Cloudflare
Workers compatibility checks. Support replies are deterministic. Customers,
payment evidence, and history are synthetic. When configured, Neon PostgreSQL
stores the demo cases used by both support and billing. No model is connected.

## Run locally

Use Node 24.22.1 and pnpm 10.8.1. The project pins Node in `.nvmrc`.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm cf:typegen
pnpm dev --host 127.0.0.1
```

Open http://127.0.0.1:5173. Choose a demo customer and investigate the seeded access
issue. Alex and Sam belong to the same synthetic organization; Jules belongs to
another. Each signed session can retrieve only its own case and billing record.

The fixture selector is restricted to loopback hostnames and explicit demo mode.
It is development authentication, not a production sign-in mechanism.

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
# With the local Worker running in another terminal:
pnpm test:smoke
pnpm check:providers
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
already exists. On Vite startup/build, the app copies only `DATABASE_URL` into
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

The support panel still uses seeded case history. These checks verify the SDK
connection; production memory eligibility and durable dispatch/reconciliation
must be implemented before support requests can save memories.

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

`neon.ts` manages Postgres only and preserves existing branch settings. Test
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
verification. Remove local demo assumptions and establish production auth before
opening support access publicly.

See [architecture](docs/architecture.md) for request boundaries, provider status,
and the remaining authentication, persistence, and background-work implementation.
