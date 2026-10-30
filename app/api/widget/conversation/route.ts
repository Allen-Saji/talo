import { and,eq,gt,desc } from "drizzle-orm";
import { widgetHandler } from "../../../../lib/widget/service";
import { runtimeConfig } from "../../../../lib/runtime";
import { widgetIdentity } from "../../../../lib/widget/identity";
import { createDatabase } from "../../../../lib/db/client";
import { conversations } from "../../../../lib/db/schema";
import { json } from "../../../../lib/http";
export const GET=widgetHandler(runtimeConfig,async(request,config,app)=>{
 const identity=await widgetIdentity(request,config,app.id);
 let [record]=await createDatabase(config.DATABASE_URL!).select({messages:conversations.messages,status:conversations.status}).from(conversations).where(and(eq(conversations.id,identity.conversationId),eq(conversations.appId,app.id),eq(conversations.customerId,identity.customerId),gt(conversations.expiresAt,new Date()))).limit(1);
 if(!record&&identity.verified){
  [record]=await createDatabase(config.DATABASE_URL!).select({messages:conversations.messages,status:conversations.status}).from(conversations).where(and(eq(conversations.appId,app.id),eq(conversations.customerId,identity.customerId),gt(conversations.expiresAt,new Date()))).orderBy(desc(conversations.updatedAt)).limit(1);
 }
 return json(record??{messages:[],status:'open'});
});
export const OPTIONS=GET;
