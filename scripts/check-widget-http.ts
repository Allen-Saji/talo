import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const base="http://127.0.0.1:5175";
const host="http://127.0.0.1:5178";
async function main(){
 const account=JSON.parse(readFileSync(".wrangler/public-auth-check.json","utf8")).accounts[0];
 assert.match(account.email,/^talo-check-[0-9a-f]+@example\.com$/);
 const login=await fetch(base+"/api/auth/sign-in/email",{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({email:account.email,password:account.password})});assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const owned=async(method:string,body?:unknown)=>fetch(base+"/api/applications",{method,headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
 try{
 const current=await(await owned("GET")).json() as {application:{revision:number}|null};
 const settings={name:"Integration test product",origins:[host],documentation:"Invite a teammate by opening Settings and choosing Team. The Team menu is inside your workspace Settings. Select Invite member and enter their email address.\n\nExport reports using the Export button on the Reports page.",widgetEnabled:true,revision:current.application?.revision??0};
 const created=await owned("PUT",settings);assert.equal(created.status,200);let app=(await created.json() as {application:{id:string;revision:number}}).application;
 let widgetToken='';
 const request=(path:string,origin=host,method="GET",body?:unknown)=>fetch(`${base}/api/widget/${path}?appId=${app.id}`,{method,headers:{Origin:origin,"Content-Type":"application/json",...(widgetToken?{Authorization:`Bearer ${widgetToken}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const config=await request("config");assert.equal(config.status,200);assert.equal(config.headers.get("Access-Control-Allow-Origin"),host);const configData=await config.json() as {name:string;sessionToken:string};assert.equal(configData.name,settings.name);assert.ok(configData.sessionToken);widgetToken=configData.sessionToken;
 assert.equal((await request("chat",host,"OPTIONS")).status,204);
 assert.equal((await request("chat","https://unregistered.example","POST",{message:"invite teammates"})).status,403);
 const answerResponse=await request("chat",host,"POST",{message:"How do I invite a teammate?",history:[]});assert.equal(answerResponse.status,200);const answer=await answerResponse.json() as {answer:string;source:string;generation:string};assert.ok(settings.documentation.includes(answer.source));assert.match(answer.answer,/Team|Settings/);
 const disabled=await owned("PUT",{...settings,revision:app.revision,widgetEnabled:false});app=(await disabled.json() as {application:typeof app}).application;
 assert.equal((await request("chat",host,"POST",{message:"invite"})).status,404);
 const enabled=await owned("PUT",{...settings,revision:app.revision});assert.equal(enabled.status,200);
 writeFileSync(".wrangler/widget-check-result.json",JSON.stringify({appId:app.id,host,base,generation:answer.generation}),{mode:0o600});
 console.log(`Widget HTTP passed: published config, CORS preflight, origin rejection, cited ${answer.generation} answer, disable/re-enable. Synthetic app enabled for local host.`);
 }finally{await fetch(base+"/api/auth/sign-out",{method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},body:"{}"});}
}
main().catch(()=>{console.error("Widget check failed; credentials hidden.");process.exitCode=1;});
