import {and,eq,gt} from 'drizzle-orm';
import {z} from 'zod';
import {widgetHandler} from '../../../../lib/widget/service';
import {widgetIdentity} from '../../../../lib/widget/identity';
import {runtimeConfig} from '../../../../lib/runtime';
import {ApiError,json,parseBody} from '../../../../lib/http';
import {createDatabase} from '../../../../lib/db/client';
import {conversations} from '../../../../lib/db/schema';
const feedback=z.object({outcome:z.enum(['helped','still_stuck']),revision:z.iso.datetime()}).strict();
export const POST=widgetHandler(runtimeConfig,async(request,config,app)=>{
 const identity=await widgetIdentity(request,config,app.id);const input=await parseBody(request,feedback);
 const rows=await createDatabase(config.DATABASE_URL!).update(conversations).set({customerOutcome:input.outcome,outcomeAt:new Date(),...(input.outcome==='still_stuck'?{status:'needs_human'}:{})}).where(and(eq(conversations.id,identity.conversationId),eq(conversations.appId,app.id),eq(conversations.customerId,identity.customerId),gt(conversations.expiresAt,new Date()),eq(conversations.updatedAt,new Date(input.revision)))).returning({id:conversations.id});
 if(!rows.length)throw new ApiError(409,'CONVERSATION_CHANGED','The conversation changed. Send a message before giving feedback again.');
 return json({saved:true});
});
export const OPTIONS=POST;
