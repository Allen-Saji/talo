import { sql } from "drizzle-orm";
import { createDatabase } from "../db/client";
import type { Config } from "../config";
export async function purgeExpiredWidgetData(config:Config){
 if(!config.DATABASE_URL)return;const db=createDatabase(config.DATABASE_URL);
 // Bounded batches keep scheduled work predictable; expired rows are excluded from all reads immediately.
 await db.execute(sql`DELETE FROM customer_memory WHERE ("appId","customerId") IN (SELECT "appId","customerId" FROM customer_memory WHERE "expiresAt"<=now() LIMIT 500)`);
 await db.execute(sql`DELETE FROM conversations WHERE id IN (SELECT id FROM conversations WHERE "expiresAt"<=now() LIMIT 500)`);
}
