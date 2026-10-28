import { defineConfig } from "drizzle-kit";
import { loadLocalEnv } from "./scripts/local-env.mjs";

loadLocalEnv();

export default defineConfig({
  dialect: "postgresql", schema: "./lib/db/schema.ts", out: "./drizzle",
  // Keep schema operations on the direct connection, outside the pooler.
  ...(process.env.DATABASE_URL_UNPOOLED ? { dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED } } : {}),
});
