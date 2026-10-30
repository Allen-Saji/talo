import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { api,ApiError,json,parseBody,requireSameOrigin } from '../../../../lib/http';
import { runtimeConfig, knowledgeImporter } from '../../../../lib/runtime';
import { publicSession } from '../../../../lib/public-auth';
import { createDatabase } from '../../../../lib/db/client';
import { KNOWLEDGE_LIMIT,scanKnowledge } from '../../../../lib/knowledge/safety';
const input=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('url'),url:z.string().max(2000)}).strict(),
 z.object({kind:z.literal('text'),text:z.string().min(30).max(KNOWLEDGE_LIMIT)}).strict(),
]);
export const POST=api(async request=>{
 requireSameOrigin(request);const config=runtimeConfig();
 if(!config.TALO_PUBLIC_AUTH||!config.DATABASE_URL)throw new ApiError(503,'UNAVAILABLE','Knowledge import is unavailable.');
 const account=await publicSession(config);if(!account)throw new ApiError(401,'SIGN_IN_REQUIRED','Sign in to import documentation.');if(!account.emailVerified)throw new ApiError(403,'VERIFY_EMAIL','Verify your email first.');
 const data=await parseBody(request,input,240000);
 const counter=`imports:${account.id}:${new Date().toISOString().slice(0,10)}`;
 const reserved=await createDatabase(config.DATABASE_URL).execute(sql`INSERT INTO model_daily_usage(day,requests) VALUES(${counter},1) ON CONFLICT(day) DO UPDATE SET requests=model_daily_usage.requests+1 WHERE model_daily_usage.requests<30 RETURNING requests`);
 if(!reserved.rows.length)throw new ApiError(429,'IMPORT_LIMIT','Daily import limit reached. Try again tomorrow.');
 let result:{text:string;source:string};
 try{
   if(data.kind==='url'){
     const importer=knowledgeImporter();
     if(!importer)throw new ApiError(503,'IMPORT_UNAVAILABLE','Website import is unavailable. Upload a document or paste text.');
     const response=await importer.fetch('https://knowledge-import.internal/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:data.url})});
     const extracted=await response.json() as {text:string;source:string;error?:{code:string;message:string}};
     if(!response.ok)throw new ApiError(response.status,extracted.error?.code??'IMPORT_FAILED',extracted.error?.message??'Could not read this page.');
     result=extracted;
   }else result={text:data.text,source:'Document text'};
 }
 catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'IMPORT_FAILED','Could not read this source safely. Try a smaller public page or paste its text.');}
 return json({...result,findings:scanKnowledge(result.text),reviewRequired:true});
});
