import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDatabase(connectionString: string) {
  const client = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(10_000) } });
  return drizzle({ client, schema });
}
