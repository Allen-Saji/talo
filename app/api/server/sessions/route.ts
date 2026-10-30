import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { api, ApiError, json, parseBody } from "../../../../lib/http";
import { runtimeConfig } from "../../../../lib/runtime";
import { createDatabase } from "../../../../lib/db/client";
import { applications, applicationCredentials } from "../../../../lib/db/schema";
import { accountFacts, hash, matchesKey, issueWidgetIdentity } from "../../../../lib/widget/identity";
const input=z.object({appId:z.string().max(100),customerId:z.string().trim().min(1).max(200),origin:z.string().max(250),facts:accountFacts.default({}),automaticMemory:z.boolean().default(false)}).strict();
export const POST=api(async request=>{
 // Server-to-server only. Never permit browser code to use the application secret.
 if(request.headers.has("Origin"))throw new ApiError(403,"SERVER_ONLY","Call this endpoint from your backend.");
 const config=runtimeConfig();if(!config.DATABASE_URL)throw new ApiError(503,"UNAVAILABLE","Support identity is unavailable.");
 const key=request.headers.get("Authorization")?.match(/^Bearer (talo_sk_[A-Za-z0-9_-]{43})$/)?.[1];if(!key)throw new ApiError(401,"INVALID_KEY","A valid server key is required.");
 const data=await parseBody(request,input);
 const db=createDatabase(config.DATABASE_URL);
 const [credential]=await db.select().from(applicationCredentials).where(eq(applicationCredentials.appId,data.appId)).limit(1);
 if(!credential||!matchesKey(key,credential.keyHash))throw new ApiError(401,"INVALID_KEY","A valid server key is required.");
 const [app]=await db.select().from(applications).where(eq(applications.id,data.appId)).limit(1);
 if(!app?.widgetEnabled||!app.origins.includes(data.origin))throw new ApiError(403,"ORIGIN_REJECTED","Enable this widget and register the customer website origin.");
 const counter=`sessions:${app.id}:${new Date().toISOString().slice(0,10)}`;
 const reserved=await db.execute(sql`INSERT INTO model_daily_usage(day,requests) VALUES(${counter},1) ON CONFLICT(day) DO UPDATE SET requests=model_daily_usage.requests+1 WHERE model_daily_usage.requests<200 RETURNING requests`);
 if(!reserved.rows.length)throw new ApiError(429,"SESSION_LIMIT","Daily support-session limit reached.");
 const token=issueWidgetIdentity(config,{appId:app.id,customerId:hash(`${app.id}:${data.customerId}`),origin:data.origin,verified:true,version:credential.version,facts:data.facts,automaticMemory:data.automaticMemory});
 return json({token,expiresIn:900});
});
