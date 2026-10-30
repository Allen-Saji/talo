import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {eq,and,gt} from 'drizzle-orm';
import {readLocalEnv} from './local-env.mjs';
import {createDatabase} from '../lib/db/client';
import {tenants,applications,conversations} from '../lib/db/schema';
import {recordConversation} from '../lib/widget/state';
import {readConfig} from '../lib/config';
async function main(){const env=parseEnv(readFileSync('.env.memory-schema-check','utf8'));assert.notEqual(new URL(env.DATABASE_URL!).hostname.replace('-pooler',''),new URL(readLocalEnv().DATABASE_URL).hostname.replace('-pooler',''));const db=createDatabase(env.DATABASE_URL!);const id=randomUUID();const appId=`app_${randomUUID()}`;await db.insert(tenants).values({id,name:'Synthetic insights migration check'});await db.insert(applications).values({id:appId,tenantId:id,name:'Insights test',origins:['https://example.com'],documentation:'Test documentation only.'});const identity={appId,customerId:'synthetic-a',conversationId:randomUUID(),verified:true,version:'test',origin:'https://example.com',expiresAt:Date.now()+900000,facts:{}};const config=readConfig(env);const first=await recordConversation(config,identity,'How do I export reports?','Open Reports.',false,false);const changed=await db.update(conversations).set({customerOutcome:'helped',outcomeAt:new Date()}).where(and(eq(conversations.id,identity.conversationId),eq(conversations.appId,appId),eq(conversations.customerId,identity.customerId),eq(conversations.updatedAt,first.updatedAt),gt(conversations.expiresAt,new Date()))).returning();assert.equal(changed.length,1);assert.equal(changed[0].customerOutcome,'helped');const next=await recordConversation(config,identity,'It still fails.','Ask support.',false,true);assert.equal(next.customerOutcome,null);assert.equal(next.outcomeAt,null);const stale=await db.update(conversations).set({customerOutcome:'helped'}).where(and(eq(conversations.id,identity.conversationId),eq(conversations.updatedAt,first.updatedAt))).returning();assert.equal(stale.length,0);console.log('Isolated insights DB passed: migration, precise feedback revision, outcome reset and stale rejection.');}
main().catch(()=>{console.error('Isolated insights check failed; credentials hidden.');process.exitCode=1;});
