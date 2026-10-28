import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createDatabase } from "../lib/db/client";
import { memberships, supportCases, tenants, users } from "../lib/db/schema";
import { demoCases, demoUsers } from "../lib/demo/fixtures";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv();
try {
  const command = process.argv[2];
  if (command === "migrate") {
    const url = process.env.DATABASE_URL_UNPOOLED;
    if (!url || new URL(url).hostname.includes("-pooler")) throw new Error("DIRECT_URL_REQUIRED");
    // Migrations need an interactive transaction; runtime queries keep HTTP.
    neonConfig.webSocketConstructor = WebSocket;
    const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15_000 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
      console.log("Drizzle migrations applied using the direct Neon connection.");
    } finally { await pool.end(); }
  } else if (command === "seed") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
    const db = createDatabase(process.env.DATABASE_URL);
    const organizations = [...new Map(demoUsers.map((user) => [user.tenantId, { id: user.tenantId, name: user.tenantName }])).values()];
    await db.batch([
      db.insert(tenants).values(organizations).onConflictDoNothing(),
      db.insert(users).values(demoUsers.map((user) => ({ id: user.id, name: user.name }))).onConflictDoNothing(),
      db.insert(memberships).values(demoUsers.map((user) => ({ tenantId: user.tenantId, userId: user.id }))).onConflictDoNothing(),
      db.insert(supportCases).values(demoCases.map(({ owner, ...item }) => ({ ...item, ...owner }))).onConflictDoNothing(),
    ]);
    console.log("Seeded 3 synthetic support cases with scoped memberships. Existing records preserved.");
  } else { throw new Error("UNKNOWN_DATABASE_COMMAND"); }
} catch {
  // Driver errors can include connection details or submitted values.
  console.error("Database setup failed. Check the command, Neon credentials, direct migration URL, and schema compatibility. Credentials hidden.");
  process.exitCode = 1;
}
