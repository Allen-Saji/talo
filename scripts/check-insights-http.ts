import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base=process.env.TALO_LOCAL_URL??'http://127.0.0.1:5175';
async function main(){const accounts=JSON.parse(readFileSync('.wrangler/public-auth-check.json','utf8')).accounts;const fixture=JSON.parse(readFileSync('.wrangler/widget-identity-check.json','utf8'));const cookies:string[]=[];const owner=(path:string,cookie='',body?:unknown)=>fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await owner('/api/insights')).status,401);
 try{for(const a of accounts.slice(0,2)){const r=await owner('/api/auth/sign-in/email','',{email:a.email,password:a.password});assert.equal(r.status,200);cookies.push(r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '));}
 const before=await(await owner('/api/insights',cookies[0])).json() as {total:number};assert.equal(typeof before.total,'number');
 async function session(customerId:string){const r=await fetch(base+'/api/server/sessions',{method:'POST',headers:{Authorization:`Bearer ${fixture.key}`,'Content-Type':'application/json'},body:JSON.stringify({appId:fixture.appId,customerId,origin:fixture.origin,facts:{plan:'Pro'}})});assert.equal(r.status,200);return(await r.json() as {token:string}).token;}
 const token=await session('synthetic-insights-'+randomUUID());const other=await session('synthetic-insights-other-'+randomUUID());
 const widget=(path:string,bearer:string,body:unknown)=>fetch(`${base}/api/widget/${path}?appId=${fixture.appId}`,{method:'POST',headers:{Origin:fixture.origin,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const first=await widget('chat',token,{message:'What plan is my account on?'});assert.equal(first.status,200);const chat=await first.json() as {conversationId:string;revision:string};assert.ok(chat.revision);
 assert.equal((await widget('feedback',other,{outcome:'helped',revision:chat.revision})).status,409);
 assert.equal((await widget('feedback',token,{outcome:'helped',revision:chat.revision})).status,200);
 const helpful=await(await owner('/api/insights',cookies[0])).json() as {total:number;helped:number;topics:Array<{evidence:Array<{id:string}>}>};assert.equal(helpful.total,before.total+1);assert.ok(helpful.helped>=1);assert.ok(helpful.topics.flatMap(t=>t.evidence).some(e=>e.id===chat.conversationId));
 const evidence=await(await owner('/api/conversations?id='+chat.conversationId,cookies[0])).json() as {conversations:unknown[]};assert.equal(evidence.conversations.length,1);
 const deniedResponse=await owner('/api/conversations?id='+chat.conversationId,cookies[1]);assert.ok([200,404].includes(deniedResponse.status));if(deniedResponse.status===200){const denied=await deniedResponse.json() as {conversations:unknown[]};assert.equal(denied.conversations.length,0);}
 const otherInsights=await owner('/api/insights?appId='+fixture.appId,cookies[1]);assert.ok([200,404].includes(otherInsights.status));assert.ok(!(await otherInsights.text()).includes(chat.conversationId));
 assert.equal((await widget('feedback',token,{outcome:'still_stuck',revision:chat.revision})).status,200);
 const stuck=await(await owner('/api/insights',cookies[0])).json() as {helped:number;stillStuck:number;needsHuman:number};assert.equal(stuck.helped,helpful.helped-1);assert.ok(stuck.stillStuck>=1);assert.ok(stuck.needsHuman>=1);
 assert.equal((await widget('chat',token,{message:'Which plan do I have?'})).status,200);
 assert.equal((await widget('feedback',token,{outcome:'helped',revision:chat.revision})).status,409);
 const reset=await(await owner('/api/insights',cookies[0])).json() as {stillStuck:number};assert.equal(reset.stillStuck,stuck.stillStuck-1);
 console.log('Insights HTTP passed: owner isolation, feedback, source evidence, cross-customer denial, outcome reset and stale rejection. Synthetic test conversations only.');
 }finally{for(const cookie of cookies)await owner('/api/auth/sign-out',cookie,{});}
}
main().catch(()=>{console.error('Insights HTTP check failed; credentials and customer data hidden.');process.exitCode=1;});
