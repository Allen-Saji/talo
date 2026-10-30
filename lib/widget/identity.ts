import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { applicationCredentials } from "../db/schema";
import { createDatabase } from "../db/client";
import { ApiError } from "../http";
import type { Config } from "../config";

export const accountFacts = z.object({
  plan: z.string().trim().max(80).optional(),
  subscriptionStatus: z.enum(["active","trialing","past_due","canceled","none"]).optional(),
  accountStatus: z.enum(["active","pending","suspended"]).optional(),
  supportEmail: z.email().max(200).optional(),
}).strict();
const tokenSchema=z.object({appId:z.string(),customerId:z.string().max(100),conversationId:z.uuid(),origin:z.string(),verified:z.boolean(),version:z.string(),expiresAt:z.number(),facts:accountFacts}).strict();
export type WidgetIdentity=z.infer<typeof tokenSchema>;
export function hash(value:string){return createHash("sha256").update(value).digest("hex");}
export function newApplicationKey(){return `talo_sk_${randomBytes(32).toString("base64url")}`;}
export function matchesKey(key:string,hashValue:string){const supplied=Buffer.from(hash(key));const expected=Buffer.from(hashValue);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
function signingSecret(config:Config){if(!config.NEON_AUTH_COOKIE_SECRET||config.NEON_AUTH_COOKIE_SECRET.length<32)throw new ApiError(503,"IDENTITY_UNAVAILABLE","Support identity is unavailable.");return config.NEON_AUTH_COOKIE_SECRET;}
export function issueWidgetIdentity(config:Config,identity:Omit<WidgetIdentity,"expiresAt"|"conversationId">,now=Date.now()){
  const payload=Buffer.from(JSON.stringify({...identity,conversationId:randomUUID(),expiresAt:now+15*60*1000})).toString("base64url");
  const signature=createHmac("sha256",signingSecret(config)).update(`talo-widget-v1:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyWidgetToken(config:Config,token:string,appId:string,origin:string,now=Date.now()):WidgetIdentity{
  try{
    if(token.length>4096)throw Error();
    const parts=token.split('.');if(parts.length!==2)throw Error();
    const expected=createHmac("sha256",signingSecret(config)).update(`talo-widget-v1:${parts[0]}`).digest();const supplied=Buffer.from(parts[1],"base64url");
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw Error();
    const value=tokenSchema.parse(JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")));
    if(value.appId!==appId||value.origin!==origin||value.expiresAt<=now||value.expiresAt>now+15*60*1000)throw Error();
    return value;
  }catch{throw new ApiError(401,"SESSION_EXPIRED","Support session expired. Refresh or sign in again.");}
}
export async function widgetIdentity(request:Request,config:Config,appId:string){
  const token=request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];if(!token)throw new ApiError(401,"SESSION_REQUIRED","A support session is required.");
  const identity=verifyWidgetToken(config,token,appId,request.headers.get("Origin")??"");
  if(identity.verified){
    const [key]=await createDatabase(config.DATABASE_URL!).select({version:applicationCredentials.version}).from(applicationCredentials).where(eq(applicationCredentials.appId,appId)).limit(1);
    if(!key||key.version!==identity.version)throw new ApiError(401,"KEY_ROTATED","Support identity changed. Sign in again.");
  }
  return identity;
}
