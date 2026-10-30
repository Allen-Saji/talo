import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { conversations, customerMemory } from "../db/schema";
import { ApiError } from "../http";
import type { Config } from "../config";
import type { WidgetIdentity } from "./identity";
export const messagesSchema=z.array(z.object({role:z.enum(["user","assistant"]),text:z.string().max(1800)}).strict()).max(40);
export type Messages=z.infer<typeof messagesSchema>;
const expires=()=>new Date(Date.now()+30*86400*1000);
export async function remembered(config:Config,identity:WidgetIdentity){
 if(!identity.verified)return [];
 const [record]=await createDatabase(config.DATABASE_URL!).select().from(customerMemory).where(and(eq(customerMemory.appId,identity.appId),eq(customerMemory.customerId,identity.customerId),gt(customerMemory.expiresAt,new Date()))).limit(1);
 return record?messagesSchema.parse(record.messages).slice(-6):[];
}
export async function conversationHistory(config:Config,identity:WidgetIdentity,remember:boolean){
 const [record]=await createDatabase(config.DATABASE_URL!).select().from(conversations).where(and(eq(conversations.id,identity.conversationId),eq(conversations.appId,identity.appId),eq(conversations.customerId,identity.customerId),gt(conversations.expiresAt,new Date()))).limit(1);
 return record?messagesSchema.parse(record.messages).slice(-6):remember?remembered(config,identity):[];
}
export async function forgetMemory(config:Config,identity:WidgetIdentity){
 if(!identity.verified)throw new ApiError(403,"IDENTITY_REQUIRED","Sign in to manage persistent memory.");
 await createDatabase(config.DATABASE_URL!).delete(customerMemory).where(and(eq(customerMemory.appId,identity.appId),eq(customerMemory.customerId,identity.customerId)));
}
export async function recordConversation(config:Config,identity:WidgetIdentity,question:string,answer:string,remember:boolean,handoff:boolean){
 const db=createDatabase(config.DATABASE_URL!);const pair:Messages=[{role:"user",text:question},{role:"assistant",text:answer}];
 // Row-level upsert serializes appends, preserving parallel messages. The inbox retains at most20 exchanges.
 const rows=await db.insert(conversations).values({id:identity.conversationId,appId:identity.appId,customerId:identity.customerId,verified:identity.verified,messages:pair,updatedAt:new Date(),expiresAt:expires(),status:handoff?"needs_human":"open"}).onConflictDoUpdate({target:conversations.id,set:{customerOutcome:null,outcomeAt:null,messages:sql`(SELECT coalesce(jsonb_agg(item ORDER BY n),'[]'::jsonb) FROM (SELECT item,n FROM jsonb_array_elements(${conversations.messages} || ${JSON.stringify(pair)}::jsonb) WITH ORDINALITY AS entries(item,n) ORDER BY n DESC LIMIT 40) AS recent)`,updatedAt:new Date(),expiresAt:expires(),status:handoff?"needs_human":sql`CASE WHEN ${conversations.status}='needs_human' THEN 'needs_human' ELSE 'open' END`},setWhere:and(eq(conversations.appId,identity.appId),eq(conversations.customerId,identity.customerId))}).returning();
 if(!rows[0])throw new ApiError(409,"CONVERSATION_CHANGED","Start a new conversation.");
 if(remember&&identity.verified)await db.insert(customerMemory).values({appId:identity.appId,customerId:identity.customerId,messages:messagesSchema.parse(rows[0].messages).slice(-6),expiresAt:expires()}).onConflictDoUpdate({target:[customerMemory.appId,customerMemory.customerId],set:{messages:messagesSchema.parse(rows[0].messages).slice(-6),expiresAt:expires(),updatedAt:new Date()}});
 return rows[0];
}
