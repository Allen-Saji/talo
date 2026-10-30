import { runtimeConfig } from "../../../../lib/runtime";
import { ApiError, json, parseBody } from "../../../../lib/http";
import { widgetHandler, reserveWidgetRequest } from "../../../../lib/widget/service";
import { chatInput, documentationFallback, generateDocumentationAnswer } from "../../../../lib/widget/answer";
import { reserveSupportGeneration } from "../../../../lib/providers/openai";
import { accountAnswer } from "../../../../lib/widget/account-answer";
import { widgetIdentity } from "../../../../lib/widget/identity";
import { conversationHistory, recordConversation } from "../../../../lib/widget/state";
export const POST=widgetHandler(runtimeConfig,async(request,config,app)=>{
  const identity=await widgetIdentity(request,config,app.id);
  const input=await parseBody(request,chatInput,65536);
  if(input.remember&&!identity.verified)throw new ApiError(403,"IDENTITY_REQUIRED","Sign in to remember conversations across visits.");
  if(!await reserveWidgetRequest(config,app.id))throw new ApiError(429,"RATE_LIMITED","Support is temporarily unavailable. Please try again later.");
  const history=await conversationHistory(config,identity,input.remember);
  const knowledge=app.documentation;
  const direct=accountAnswer(input.message,identity);
  let answer=direct??documentationFallback(knowledge,input.message);
  if(!direct&&await reserveSupportGeneration(config)){
    try { answer=await generateDocumentationAnswer(config,knowledge,{...input,history}); } catch { /* Use the scoped excerpt fallback. */ }
  }
  const needsHuman=answer.generation==="unavailable";
  const recorded=await recordConversation(config,identity,input.message,answer.answer,input.remember,needsHuman);
  return json({...answer,conversationId:identity.conversationId,needsHuman,verified:identity.verified,revision:recorded.updatedAt.toISOString()});
});
export const OPTIONS=POST;
