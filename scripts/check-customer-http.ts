import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
const base=process.env.TALO_LOCAL_URL??'http://127.0.0.1:5175';
assert.ok(['http://127.0.0.1:5175','https://talo.metropolis-frontend.workers.dev'].includes(base));
const origin='http://127.0.0.1:5178';
let stage="sign-in";
async function main(){
 const accounts=JSON.parse(readFileSync('.wrangler/public-auth-check.json','utf8')).accounts;const cookies:string[]=[];
 const owner=(path:string,cookie:string,body?:unknown,method=body?'POST':'GET')=>fetch(base+path,{method,headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
 for(const account of accounts.slice(0,2)){assert.match(account.email,/^talo-check-[0-9a-f]+@example\.com$/);const login=await owner('/api/auth/sign-in/email','',{email:account.email,password:account.password});assert.equal(login.status,200);cookies.push(login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '));}
 stage='application-settings';
 const profile=await(await owner('/api/applications',cookies[0])).json() as {application:{id:string;revision:number}};
 const setting=await owner('/api/applications',cookies[0],{name:'Integration test product',origins:[origin],documentation:'Invite a teammate by opening Settings and choosing Team. The Team menu is inside your workspace Settings. Select Invite member and enter their email address.',widgetEnabled:true,revision:profile.application.revision},'PUT');assert.equal(setting.status,200);
 const appId=profile.application.id;
 stage='server-key';
 const keyResponse=await owner('/api/applications/key',cookies[0],{});assert.equal(keyResponse.status,200);const {key}=await keyResponse.json() as {key:string};
 async function session(customerId:string){const r=await fetch(base+'/api/server/sessions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({appId,origin,customerId,facts:{plan:'Pro',subscriptionStatus:'active'}})});assert.equal(r.status,200);return (await r.json() as {token:string}).token;}
 async function widget(path:string,token:string,body?:unknown){return fetch(`${base}/api/widget/${path}?appId=${appId}`,{method:body?'POST':'GET',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
 stage='issue-sessions';
 const token=await session('synthetic-alice');const other=await session('synthetic-bob');assert.equal(JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString()).facts.plan,'Pro');
 assert.equal((await fetch(base+'/api/server/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,403);
 stage='private-answer';
 const answer=await widget('chat',token,{message:'What plan is my account on?',remember:true});assert.equal(answer.status,200);const result=await answer.json() as {answer:string;conversationId:string;generation:string;source:string|null};console.log('Synthetic answer diagnostics:',JSON.stringify({generation:result.generation,hasPlan:/\bpro\b/i.test(result.answer),citesPlan:result.source?.includes('Pro')??false}));assert.match(result.answer,/\bpro\b/i);
 stage='returning-memory';
 const returning=await session('synthetic-alice');const recalled=await(await widget('memory',returning)).json() as {history:unknown[]};assert.equal(recalled.history.length,2);assert.equal((await(await widget('memory',other)).json() as typeof recalled).history.length,0);
 stage='handoff';
 assert.equal((await widget('memory',token,{action:'handoff'})).status,200);
 stage='inbox';
 const queue=await(await owner('/api/conversations',cookies[0])).json() as {conversations:Array<{id:string;status:string}>};assert.ok(queue.conversations.some(row=>row.id===result.conversationId&&row.status==='needs_human'));
 assert.equal((await owner('/api/conversations',cookies[1],{action:'status',id:result.conversationId,status:'resolved'})).status,404);
 assert.equal((await owner('/api/conversations',cookies[0],{action:'reply',id:result.conversationId,text:'We can help you with your workspace.'})).status,200);
 stage='returning-team-reply';
 const thread=await(await widget('conversation',returning)).json() as {messages:Array<{text:string}>};assert.ok(thread.messages.some(m=>m.text.includes('Support team: We can help')));
 assert.equal((await(await widget('conversation',other)).json() as typeof thread).messages.length,0);
 stage='forget';
 assert.equal((await widget('memory',token,{action:'forget'})).status,200);assert.equal((await(await widget('memory',returning)).json() as typeof recalled).history.length,0);
 stage='rotation';
 const rotated=await owner('/api/applications/key',cookies[0],{});const finalKey=(await rotated.json() as {key:string}).key;assert.equal((await widget('memory',token)).status,401);
 writeFileSync('.wrangler/widget-identity-check.json',JSON.stringify({base,appId,origin,key:finalKey}),{mode:0o600});
 console.log('Identity HTTP passed: private plan facts, returning-customer recall, other-customer denial, handoff, owner inbox/reply, cross-owner denial, returning reply, forget, rotated-key revocation.');
 }finally{for(const cookie of cookies)await owner('/api/auth/sign-out',cookie,{});}
}
main().catch(error=>{console.error('Identity HTTP check failed at',stage,'numeric status',typeof error?.actual==='number'?error.actual:'unavailable','; credentials and content hidden.');process.exitCode=1;});
