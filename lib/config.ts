import { z } from "zod";

const secret = z.string().trim().optional().transform((value) => value || undefined);
const schema = z.object({
  TALO_DEMO_MODE: z.string().optional().transform((value) => value === "true"),
  TALO_DIAGNOSTICS_ENABLED: z.string().optional().transform((value) => value === "true"),
  DATABASE_URL: secret, TATUM_API_KEY: secret, TATUM_TRANSACTION_DIGEST: secret,
  MEMWAL_PRIVATE_KEY: secret, MEMWAL_ACCOUNT_ID: secret,
  MEMWAL_SERVER_URL: secret.pipe(z.literal("https://relayer.memory.walrus.xyz").optional()),
  OPENAI_API_KEY: secret,
  TALO_PUBLIC_AUTH: z.string().optional().transform((value) => value === "true"),
  NEON_AUTH_BASE_URL: secret.pipe(z.url().optional()),
  NEON_AUTH_COOKIE_SECRET: secret,
  SESSION_SECRET: secret, DIAGNOSTICS_TOKEN: secret,
});
export type Config = z.infer<typeof schema>;
export function readConfig(environment: unknown): Config { return schema.parse(environment); }
export function isLocalRequest(request: Request) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}
