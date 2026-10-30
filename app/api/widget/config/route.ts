import { runtimeConfig } from "../../../../lib/runtime";
import { json } from "../../../../lib/http";
import { widgetHandler } from "../../../../lib/widget/service";
import { issueWidgetIdentity } from "../../../../lib/widget/identity";
import { randomUUID } from "node:crypto";
export const GET=widgetHandler(runtimeConfig,async(request,config,app)=>json({name:app.name,sessionToken:issueWidgetIdentity(config,{appId:app.id,customerId:randomUUID(),origin:request.headers.get("Origin")!,verified:false,version:"anonymous",facts:{}})}));
export const OPTIONS=GET;
