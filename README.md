# Talo

Support that remembers previous troubleshooting attempts and checks current facts.

This initial application runs React App Router routes through vinext and Vite on
Cloudflare Workers. Provider integrations are not connected.

## Run locally

Use the Node version pinned in .nvmrc and pnpm 10.8.1.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm cf:typegen
pnpm dev --host 127.0.0.1
```

Open http://127.0.0.1:5173. Setup preserves existing local configuration and never
prints generated secrets. Local variables and build output are gitignored.

## Verify production output locally

```sh
pnpm check
pnpm start --port 5173 --ip 127.0.0.1
```

Setup and verification do not deploy. vinext implements Next.js APIs and is under
active development; test the Workers runtime before choosing it for deployment.
