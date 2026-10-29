# Architecture

Talo runs a React App Router UI and server routes through vinext on Cloudflare
Workers. vinext implements Next.js APIs on Vite; this repository does not use the
stock Next.js build runtime. The framework is under active development, so test
production Worker output as well as the development server.

## Current request path

1. Public mode verifies a Neon Auth session and verified email on every protected
   request. Server-derived personal workspace/case IDs isolate each identity. The
   local fixture selector is a separate mode and cannot issue identities in public
   mode.
2. The support route validates the request origin, cookie, and bounded JSON body.
3. Case lookup checks both user and tenant before returning any case content.
4. With `DATABASE_URL`, the support and billing routes query Neon for the owned
   case. Otherwise the local demo uses in-memory fixtures. A configured database
   failure never falls back to fixtures.
5. Scoped Walrus recall can replace the fixture preference after matching the
   newest eligible database reference and exact provider text/blob.
6. OpenAI `gpt-6-luna` can generate an answer from the owned context after an atomic
   daily attempt reservation. Structured output has no action tools. Errors fall
   back to deterministic text. Payment and history remain labeled synthetic;
   storage, memory source, and generation mode are reported separately.

The local fixture identity selector requires explicit demo mode and a loopback
hostname; its sessions expire after eight hours. Public session state is checked
against Neon Auth without cached session-data authorization. Private
API responses use no-store. Provider errors are never echoed to the client.

## Data and providers

- Neon PostgreSQL is the selected application database. Drizzle defines users,
  tenants, memberships, support cases, and memory-job records. Cases reference a
  user/tenant membership and every lookup filters both scope values. The seed
  command inserts synthetic cases without overwriting existing records.
  Runtime queries use Drizzle's Neon HTTP adapter. Drizzle migrations use a
  direct connection and a WebSocket transaction. `neon.ts` preserves branch
  settings and enables Managed Auth, without Storage, Functions, or AI Gateway.
- Tatum's adapter uses fetch-based Sui gRPC-web with an API-key metadata header,
  explicit field masks, and a deadline. It opts into Cloudflare edge conversion
  through `cf.grpcWeb: "convert"` because Tatum responds with native gRPC.
  A protected standalone probe can verify the same adapter on Cloudflare's edge,
  with an independent public Mainnet comparison. Local workerd does not perform
  this conversion. The narrow sample matcher binds one historical SUI transfer to a synthetic invoice; it never settles a real invoice. Native grpc-js is
  not included.
- The Walrus adapter uses the managed Mainnet relayer and a reserved synthetic
  probe namespace. Submission and status reads are separate; only a completed
  job with the expected ID, namespace, and blob reference is saved. The authenticated
  memory route permits explicit structured preferences for an owned case; it
  rejects raw transcripts and caller-supplied scope.
- The explicit `check:memory write` CLI can submit one synthetic setup record,
  with a stable idempotency key and an ignored local job reference. A separate
  `verify` process confirms completion and exact text/blob recall. The read-only
  Workers probe reports whether that same synthetic record can be retrieved;
  it never returns other memory contents or uploads data.
- Local diagnostics require both explicit enablement and a separate token. SDK
  import checks do not access providers. Live probes are read-only, and the CLI
  requires --live to request them. Successful empty recall does not prove a write.

Neon CLI downloads credentials into `.env.local` (or existing `.env`). Vite
startup/build synchronizes the pooled runtime URL and Auth service URL to ignored `.dev.vars`
because Workers ignores `.env` when `.dev.vars` exists. The direct migration
URL remains outside Worker bindings. Remote Worker deployment still needs a
Cloudflare `DATABASE_URL` secret.

Provider credentials stay in server-side configuration. There is no browser
database access or direct model credential, payment execution, or external ticket delivery.

## Durable memory jobs

Neon is the durable queue and eligibility record. A scheduled Worker claims at
most five jobs per invocation with one UPDATE/SELECT FOR UPDATE SKIP LOCKED
statement. Five-minute leases and token-checked updates prevent concurrent
workers from overwriting each other's receipts. Submission retries use immutable
content and a stable idempotency key with provider content deduplication. Known
provider jobs are polled instead of resubmitted. Unknown receipts remain unknown.
After 20 dispatch attempts, unfinished jobs require operator reconciliation.

The scheduler uses one-minute cron ticks rather than a Workflow instance per
preference. Database rows preserve unclaimed work and work left by a crash;
expiry, eligibility, case ownership, membership, and provider-account binding are
checked before dispatch. Suppression prevents future retrieval but is not a
provider deletion or a cancellation of an already in-flight upload.

Namespaces are deterministic hashes of tenant/user scope, not an authorization
boundary. Recall checks database ownership, newest eligible version, 30-day
expiry, account, namespace, exact text/blob identity, and then rechecks eligibility
and ownership after the provider call. Missing or stale references fail closed.
Eligible content includes allowlisted preferences, structured customer-reported attempts, and reviewed redacted lesson templates.

## Model boundary

The server uses OpenAI Responses with fixed `gpt-6-luna`, strict structured
output, `store: false`, an 800-token output cap, a 25-second timeout, and no tools.
A single atomic Neon counter limits all users together to 20 attempts per UTC day.
Failures count and are not retried automatically. Model text is not authoritative
payment evidence; the server supplies evidence and route fields independently.

## Next integration steps

The current matcher supports a single historical SUI transfer replay. Real checkout
invoice issuance, payment bindings, and additional assets remain out of scope.
Attempt memory and operator-reviewed tenant lessons are implemented; live shared
lesson publication requires explicit human approval. Public sign-in is
implemented; hackathon testing uses Neon's shared email sender. Custom SMTP and
real email delivery/OTP checks are needed before a production launch.

## Primary references

- [Workers Next.js deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [vinext](https://github.com/cloudflare/vinext)
- [Neon driver](https://neon.com/docs/serverless/serverless-driver)
- [Drizzle Neon connection](https://orm.drizzle.team/docs/connect-neon)
- [Mysten gRPC transport](https://sdk.mystenlabs.com/sui/clients/grpc)
- [Tatum Sui APIs](https://docs.tatum.io/reference/rpc-sui)
- [Walrus Workers setup](https://docs.wal.app/walrus-memory/sdk/cloudflare-workers)
- [Walrus SDK API](https://docs.wal.app/walrus-memory/sdk/api-reference)

- [Cloudflare scheduled triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [OpenAI GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)

- [Neon public auth setup](https://neon.com/docs/auth/quick-start/nextjs-api-only)
