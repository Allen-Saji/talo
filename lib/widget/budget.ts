import { sql } from 'drizzle-orm';
import { createDatabase } from '../db/client';
import type { Config } from '../config';
import { documentationRequest, type ChatInput } from './answer';
// Reserve conservative UTF-8 input units plus maximum output before dispatch.
// Shared across every visitor in the application; failed calls are not refunded.
export const DAILY_CONTEXT_UNITS=250_000;
export const MAX_REQUEST_UNITS=48_000;
export function contextUnits(documentation:string,input:ChatInput){return new TextEncoder().encode(JSON.stringify(documentationRequest(documentation,input))).length+700;}
export async function reserveContextBudget(config:Config,appId:string,documentation:string,input:ChatInput){
 if(!config.OPENAI_API_KEY||!config.DATABASE_URL)return false;
 const units=contextUnits(documentation,input);
 if(units>MAX_REQUEST_UNITS)return false;
 const counter=`context:${appId}:${new Date().toISOString().slice(0,10)}`;
 const result=await createDatabase(config.DATABASE_URL).execute(sql`INSERT INTO model_daily_usage(day,requests) VALUES(${counter},${units}) ON CONFLICT(day) DO UPDATE SET requests=model_daily_usage.requests+${units} WHERE model_daily_usage.requests+${units}<=${DAILY_CONTEXT_UNITS} RETURNING requests`);
 return result.rows.length===1;
}
