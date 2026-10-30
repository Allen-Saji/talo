import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { api, json, requireSameOrigin } from "../../../../lib/http";
import { ownedApplication } from "../../../../lib/application-owner";
import { createDatabase } from "../../../../lib/db/client";
import { applicationCredentials } from "../../../../lib/db/schema";
import { hash, newApplicationKey } from "../../../../lib/widget/identity";
export const GET=api(async()=>{const {config,app}=await ownedApplication();const [key]=await createDatabase(config.DATABASE_URL!).select({createdAt:applicationCredentials.createdAt}).from(applicationCredentials).where(eq(applicationCredentials.appId,app.id));return json({configured:Boolean(key),createdAt:key?.createdAt??null});});
export const POST=api(async request=>{
 requireSameOrigin(request);const {config,app}=await ownedApplication();const key=newApplicationKey();const version=randomUUID();
 await createDatabase(config.DATABASE_URL!).insert(applicationCredentials).values({appId:app.id,keyHash:hash(key),version}).onConflictDoUpdate({target:applicationCredentials.appId,set:{keyHash:hash(key),version,createdAt:new Date()}});
 return json({key,message:"Save this on your backend. It will not be shown again. Previous keys and verified widget sessions are revoked."});
});
