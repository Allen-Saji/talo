import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { applications } from "../db/schema";
import { createDatabase } from "../db/client";
import type { Config } from "../config";
import { ApiError, json } from "../http";

const idSchema=z.string().regex(/^app_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export function assertWidgetOrigin(origins: string[], origin: string | null) {
  if(!origin||origin==="null"||!origins.includes(origin))throw new ApiError(403,"ORIGIN_REJECTED","This website is not enabled for this support widget.");
}
export async function widgetApplication(request: Request, config: Config) {
  const id=idSchema.safeParse(new URL(request.url).searchParams.get("appId"));
  if(!id.success)throw new ApiError(404,"WIDGET_UNAVAILABLE","This support widget is unavailable.");
  if(!config.DATABASE_URL)throw new ApiError(503,"STORAGE_UNAVAILABLE","Support is temporarily unavailable.");
  const [app]=await createDatabase(config.DATABASE_URL).select().from(applications).where(and(eq(applications.id,id.data),eq(applications.widgetEnabled,true))).limit(1);
  if(!app)throw new ApiError(404,"WIDGET_UNAVAILABLE","This support widget is unavailable.");
  assertWidgetOrigin(app.origins,request.headers.get("Origin"));
  return app;
}
export function cors(origin: string) { return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type",Vary:"Origin","Cache-Control":"no-store"}; }
// Public app IDs and Origin checks are not authentication. Only explicitly published support docs are available here.
export async function reserveWidgetRequest(config: Config, appId: string) {
  if(!config.DATABASE_URL)return false;
  const key=`widget:${appId}:${new Date().toISOString().slice(0,10)}`;
  const result=await createDatabase(config.DATABASE_URL).execute(sql`INSERT INTO model_daily_usage(day,requests) VALUES(${key},1) ON CONFLICT(day) DO UPDATE SET requests=model_daily_usage.requests+1 WHERE model_daily_usage.requests<100 RETURNING requests`);
  return result.rows.length===1;
}
export function widgetHandler(config: ()=>Config, action:(request:Request, env:Config, app:typeof applications.$inferSelect)=>Promise<Response>) {
  return async(request:Request)=>{
    let headers:HeadersInit={"Cache-Control":"no-store",Vary:"Origin"};
    try {
      const env=config();const app=await widgetApplication(request,env);headers=cors(request.headers.get("Origin")!);
      if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
      const result=await action(request,env,app);Object.entries(headers).forEach(([key,value])=>result.headers.set(key,String(value)));return result;
    }catch(error){return json({error:{message:error instanceof ApiError?error.message:"Support is temporarily unavailable."}},error instanceof ApiError?error.status:503,headers);}
  };
}
