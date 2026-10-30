import { runtimeConfig } from "../../../../lib/runtime";
import { ApiError, json, parseBody } from "../../../../lib/http";
import { widgetHandler, reserveWidgetRequest } from "../../../../lib/widget/service";
import { chatInput, documentationFallback, generateDocumentationAnswer } from "../../../../lib/widget/answer";
import { reserveSupportGeneration } from "../../../../lib/providers/openai";
export const POST=widgetHandler(runtimeConfig,async(request,config,app)=>{
  const input=await parseBody(request,chatInput,65536);
  if(!await reserveWidgetRequest(config,app.id))throw new ApiError(429,"RATE_LIMITED","This application's daily support limit has been reached. Please contact the team.");
  let answer=documentationFallback(app.documentation,input.message);
  if(await reserveSupportGeneration(config)){
    try { answer=await generateDocumentationAnswer(config,app.documentation,input); } catch { /* Bounded document excerpt fallback; never expose provider errors. */ }
  }
  return json(answer);
});
export const OPTIONS=POST;
