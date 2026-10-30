import { runtimeConfig } from "../../../../lib/runtime";
import { json } from "../../../../lib/http";
import { widgetHandler } from "../../../../lib/widget/service";
export const GET=widgetHandler(runtimeConfig,async(_request,_config,app)=>json({name:app.name}));
export const OPTIONS=GET;
