import {and,desc,eq,gt,gte,sql} from 'drizzle-orm';
import {ownedApplication} from '../../../lib/application-owner';
import {createDatabase} from '../../../lib/db/client';
import {conversations} from '../../../lib/db/schema';
import {api,ApiError,json} from '../../../lib/http';
import {summarize} from '../../../lib/insights/summary';
export const GET=api(async request=>{
 const raw=new URL(request.url).searchParams.get('days')??'30';if(!['7','30'].includes(raw))throw new ApiError(400,'INVALID_WINDOW','Choose 7 or 30 days.');
 const days=Number(raw);const {config,app}=await ownedApplication();const now=new Date();const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-days+1));
 const rows=await createDatabase(config.DATABASE_URL!).select({id:conversations.id,customerId:conversations.customerId,verified:conversations.verified,status:conversations.status,customerOutcome:conversations.customerOutcome,createdAt:conversations.createdAt,question:sql<string|null>`(jsonb_path_query_first(${conversations.messages}, '$[*] ? (@.role == "user").text') #>> '{}')`}).from(conversations).where(and(eq(conversations.appId,app.id),gt(conversations.expiresAt,now),gte(conversations.createdAt,start))).orderBy(desc(conversations.createdAt),desc(conversations.id)).limit(2001);
 return json({applicationName:app.name,...summarize(rows.slice(0,2000),days,now,rows.length>2000)});
});
