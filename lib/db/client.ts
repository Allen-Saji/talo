import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDatabase(connectionString: string) {
  const client = neon(connectionString, { fetchOptions: {
    // The HTTP client can outlive one query; each fetch needs a fresh deadline.
    get signal() { return AbortSignal.timeout(10_000); },
  } });
  return drizzle({ client, schema });
}
