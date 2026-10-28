import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql", schema: "./lib/db/schema.ts", out: "./drizzle",
  // Schema generation needs no connection. Migration commands require DATABASE_URL.
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
