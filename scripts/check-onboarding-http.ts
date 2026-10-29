import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
async function main() {
  const base = "http://127.0.0.1:5175";
  const { accounts } = JSON.parse(readFileSync(".wrangler/public-auth-check.json", "utf8"));
  async function request(path:string,method="GET",body?:unknown,cookie="") { return fetch(base+path,{method,headers:{Origin:base,"Content-Type":"application/json",Cookie:cookie},...(body?{body:JSON.stringify(body)}:{}),redirect:"manual"}); }
  assert.equal((await request("/api/applications")).status,401);
  const home = await request("/");assert.equal(home.status,200);assert.match(await home.text(),/Every conversation/);
  const playground = await request("/playground");assert.equal(playground.status,200);assert.match(await playground.text(),/Synthetic support demo/);
  const cookies:string[]=[];
  try {
    for(const account of accounts.slice(0,2)) {
      const login = await request("/api/auth/sign-in/email","POST",{email:account.email,password:account.password});
      if(login.status!==200) { console.log("Local sign-in status:",login.status);throw new Error(); }
      cookies.push(login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; "));
    }
    const input={name:"Onboarding verification",origins:["https://example.com"],documentation:"Synthetic support guide: open Settings and choose Team to invite a teammate.",revision:0};
    const initial = await (await request("/api/applications","GET",undefined,cookies[0])).json() as {application:{id:string;revision:number}|null};
    const savedResponse = await request("/api/applications","PUT",{...input,revision:initial.application?.revision??0},cookies[0]); assert.equal(savedResponse.status,200);
    const saved = await savedResponse.json() as {application:{id:string;revision:number}};
    const restored = await (await request("/api/applications","GET",undefined,cookies[0])).json() as typeof saved; assert.equal(restored.application.id,saved.application.id);
    const other=await(await request("/api/applications","GET",undefined,cookies[1])).json() as typeof initial;assert.notEqual(other.application?.id,saved.application.id);
    assert.equal((await request("/api/applications","PUT",{...input,id:saved.application.id},cookies[1])).status,400);
    assert.equal((await request("/api/applications","PUT",input,cookies[0])).status,409);
    console.log("Local HTTP passed: homepage, playground, managed sign-in, application create/reload, cross-account isolation, ownership injection denial, stale save denial.");
  } finally { for(const cookie of cookies) await request("/api/auth/sign-out","POST",{},cookie); }
}
main().catch(()=>{console.error("Onboarding HTTP check failed; account details hidden.");process.exitCode=1;});
