import { z } from "zod";
import { runtimeConfig } from "../../../../lib/runtime";
import { ApiError, json, parseBody } from "../../../../lib/http";
import { widgetHandler } from "../../../../lib/widget/service";
import { widgetIdentity, issueWidgetIdentity } from "../../../../lib/widget/identity";
import { remembered, forgetMemory } from "../../../../lib/widget/state";
import { createDatabase } from "../../../../lib/db/client";
import { conversations } from "../../../../lib/db/schema";
import { and,eq } from "drizzle-orm";
export const GET=widgetHandler(runtimeConfig,async(request,config,app)=>{const identity=await widgetIdentity(request,config,app.id);return json({verified:identity.verified,history:await remembered(config,identity)});});
export const POST=widgetHandler(runtimeConfig,async(request,config,app)=>{
 const identity=await widgetIdentity(request,config,app.id);const {action}=await parseBody(request,z.object({action:z.enum(["forget","new","handoff"])}).strict());
 if(action==="forget"){await forgetMemory(config,identity);return json({forgotten:true});}
 if(action==="handoff"){
  const rows=await createDatabase(config.DATABASE_URL!).update(conversations).set({status:"needs_human",updatedAt:new Date()}).where(and(eq(conversations.id,identity.conversationId),eq(conversations.appId,app.id),eq(conversations.customerId,identity.customerId))).returning({id:conversations.id});
  if(!rows.length)throw new ApiError(400,"CONVERSATION_REQUIRED","Send a message before requesting a handoff.");
  return json({requested:true});
 }
 const {expiresAt,conversationId,...claims}=identity;
 return json({token:issueWidgetIdentity(config,claims,expiresAt-15*60*1000)});
});
export const OPTIONS=GET;
