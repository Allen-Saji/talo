# Architecture

Talo runs a React App Router UI and server routes through vinext on Cloudflare
Workers. vinext implements Next.js APIs on Vite; this repository does not use the
stock Next.js build runtime. The framework is under active development, so test
production Worker output as well as the development server.

## Current request path

1. A local-only session endpoint signs a synthetic customer identity into an
   HttpOnly cookie. Tenant membership comes from the server's fixture registry.
2. The support route validates the request origin, cookie, and bounded JSON body.
3. Case lookup checks both user and tenant before returning any case content.
4. With `DATABASE_URL`, the support and billing routes query Neon for the owned
   case. Otherwise the local demo uses in-memory fixtures. A configured database
   failure never falls back to fixtures.
5. A deterministic response separates payment evidence, application access,
   previous attempts, and a prepared handoff. Evidence remains synthetic; the
   response reports its case storage as `neon` or `fixture` separately.

The fixture identity selector requires explicit demo mode and a loopback hostname.
It is not production authentication. Sessions expire after eight hours. Private
API responses use no-store. Provider errors are never echoed to the client.

## Data and providers

- Neon PostgreSQL is the selected application database. Drizzle defines users,
  tenants, memberships, support cases, and memory-job records. Cases reference a
  user/tenant membership and every lookup filters both scope values. The seed
  command inserts synthetic cases without overwriting existing records.
  Runtime queries use Drizzle's Neon HTTP adapter. Drizzle migrations use a
  direct connection and a WebSocket transaction. `neon.ts` preserves branch
  settings and adds no Auth, Storage, Functions, or AI Gateway services.
- Tatum's adapter uses fetch-based Sui gRPC-web with an API-key metadata header,
  explicit field masks, and a deadline. It opts into Cloudflare edge conversion
  through `cf.grpcWeb: "convert"` because Tatum responds with native gRPC.
  A protected standalone probe can verify the same adapter on Cloudflare's edge,
  with an independent public Mainnet comparison. Local workerd does not perform
  this conversion. Observations never claim invoice matching. Native grpc-js is
  not included.
- The Walrus adapter uses the managed Mainnet relayer and a reserved synthetic
  probe namespace. Submission and status reads are separate; only a completed
  job with the expected namespace and blob reference is saved. No route exposes
  memory writes in this checkpoint.
- The explicit `check:memory write` CLI can submit one synthetic setup record,
  with a stable idempotency key and an ignored local job reference. A separate
  `verify` process confirms completion and exact text/blob recall. The read-only
  Workers probe reports whether that same synthetic record can be retrieved;
  it never returns other memory contents or uploads data.
- Local diagnostics require both explicit enablement and a separate token. SDK
  import checks do not access providers. Live probes are read-only, and the CLI
  requires --live to request them. Successful empty recall does not prove a write.

Neon CLI downloads credentials into `.env.local` (or existing `.env`). Vite
startup/build synchronizes only the pooled runtime URL to ignored `.dev.vars`
because Workers ignores `.env` when `.dev.vars` exists. The direct migration
URL remains outside Worker bindings. Remote Worker deployment still needs a
Cloudflare `DATABASE_URL` secret.

Provider credentials stay in server-side configuration. There is no browser
database access, model call, payment execution, or external ticket delivery.

## Next integration steps

Prove Walrus writes from Workers and implement invoice attribution for Tatum
observations. Synthetic writes and
fresh-process recall are covered by the explicit CLI checks; Workers diagnostics
can verify reads of the same synthetic record. Add the
durable Workflow and dispatch/reconciliation mechanism with idempotency before
exposing memory writes to support requests. An accepted write is not completion.

Production authentication, invoice attribution, memory eligibility checks, model
tools, operator approvals, and background orchestration remain unimplemented.

## Primary references

- [Workers Next.js deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [vinext](https://github.com/cloudflare/vinext)
- [Neon driver](https://neon.com/docs/serverless/serverless-driver)
- [Drizzle Neon connection](https://orm.drizzle.team/docs/connect-neon)
- [Mysten gRPC transport](https://sdk.mystenlabs.com/sui/clients/grpc)
- [Tatum Sui APIs](https://docs.tatum.io/reference/rpc-sui)
- [Walrus Workers setup](https://docs.wal.app/walrus-memory/sdk/cloudflare-workers)
- [Walrus SDK API](https://docs.wal.app/walrus-memory/sdk/api-reference)
