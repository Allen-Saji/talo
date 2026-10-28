# Talo

An embedded support assistant that remembers previous troubleshooting attempts,
checks current facts, and prepares a useful handoff when an issue remains open.

This repository currently provides a local fixture demonstration and Cloudflare
Workers compatibility checks. Support replies are deterministic. Payment and
memory records are synthetic; no model or live database is connected to support.

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

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `TATUM_API_KEY` | Tatum gateway credential |
| `TATUM_TRANSACTION_DIGEST` | Known Mainnet transaction for a read-only probe |
| `MEMWAL_PRIVATE_KEY` | Walrus Memory delegate key |
| `MEMWAL_ACCOUNT_ID` | Corresponding Mainnet Memory account ID |
| `SESSION_SECRET` | At least 32 characters for local signed sessions |
| `DIAGNOSTICS_TOKEN` | At least 32 characters for local diagnostic access |

After configuring credentials, restart the server. For a production preview,
rebuild first because the adapter copies local variables into ignored build
output. Request read-only live checks explicitly:

```sh
pnpm check:providers --live
```

The live checks run a Neon read-only batch, a Tatum gRPC-web transaction read, and
an authenticated Walrus recall in a reserved synthetic namespace. Tatum transport
acceptance is not yet established. Empty recall can verify authenticated access
but does not prove memory persistence. No diagnostic endpoint uploads memories.

## Database

Drizzle defines tenants, users, memberships, and memory-job records. The initial
SQL migration is generated under `drizzle/` and has not been applied to a live
database. Support currently uses fixture records independently of this schema.

```sh
pnpm db:generate
```

Generating migrations does not require database credentials. Applying migrations
is a separate operation against an explicitly selected database.

## Stack and deployment

- React and TypeScript, using App Router conventions.
- vinext and Vite, targeting Cloudflare Workers with Node compatibility enabled.
- Neon and Drizzle for the planned application persistence layer.
- Mysten Sui gRPC-web and Walrus Memory behind server-side adapters.

vinext reimplements Next.js APIs and is under active development. This app uses
its Worker runtime rather than stock Next.js server output. Cloudflare hosting,
production credentials, and any paid plan must be configured separately. The
repository includes a deployment command but does not deploy during setup or
verification. Remove local demo assumptions and establish production auth before
opening support access publicly.

See [architecture](docs/architecture.md) for request boundaries, provider status,
and the remaining authentication, persistence, and background-work implementation.
