import { z } from "zod";
import { and,desc,eq,gt,sql } from "drizzle-orm";
import { api,ApiError,json,parseBody,requireSameOrigin } from "../../../lib/http";
import { ownedApplication } from "../../../lib/application-owner";
import { createDatabase } from "../../../lib/db/client";
import { conversations } from "../../../lib/db/schema";
const change=z.discriminatedUnion('action',[
 z.object({action:z.literal('status'),id:z.uuid(),status:z.enum(['open','needs_human','resolved'])}).strict(),
 z.object({action:z.literal('reply'),id:z.uuid(),text:z.string().trim().min(1).max(1500)}).strict(),
]);
export const GET=api(async(request)=>{const id=new URL(request.url).searchParams.get("id");if(id&&!z.uuid().safeParse(id).success)throw new ApiError(400,"INVALID_ID","Invalid conversation ID.");const {config,app}=await ownedApplication();const rows=await createDatabase(config.DATABASE_URL!).select().from(conversations).where(and(eq(conversations.appId,app.id),gt(conversations.expiresAt,new Date()),...(id?[eq(conversations.id,id)]:[]))).orderBy(desc(conversations.updatedAt)).limit(50);return json({conversations:rows});});
export const POST=api(async request=>{
 requireSameOrigin(request);const {config,app}=await ownedApplication();const input=await parseBody(request,change);const db=createDatabase(config.DATABASE_URL!);
 const patch=input.action==='status'?{status:input.status,updatedAt:new Date()}:{status:'waiting_customer',customerOutcome:null,outcomeAt:null,updatedAt:new Date(),messages:sql`(SELECT coalesce(jsonb_agg(item ORDER BY n),'[]'::jsonb) FROM (SELECT item,n FROM jsonb_array_elements(${conversations.messages} || ${JSON.stringify([{role:'assistant',text:`Support team: ${input.text}`}])}::jsonb) WITH ORDINALITY AS entries(item,n) ORDER BY n DESC LIMIT 40) AS recent)`};
 const rows=await db.update(conversations).set(patch).where(and(eq(conversations.id,input.id),eq(conversations.appId,app.id),gt(conversations.expiresAt,new Date()))).returning({id:conversations.id});
 if(!rows.length)throw new ApiError(404,'NOT_FOUND','Conversation not found.');return json({updated:true});
});
