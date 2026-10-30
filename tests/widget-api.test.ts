import { beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({limit:vi.fn(),reserve:vi.fn(),model:vi.fn()}));
vi.mock("../lib/db/client",()=>({createDatabase:()=>({select:()=>({from:()=>({where:()=>({limit:mock.limit})})}),execute:()=>({rows:[{requests:1}]})})}));
vi.mock("../lib/runtime",()=>({runtimeConfig:()=>({DATABASE_URL:"test",OPENAI_API_KEY:"test",NEON_AUTH_COOKIE_SECRET:"synthetic-cookie-secret-long-enough-for-test"})}));
vi.mock("../lib/providers/openai",()=>({supportModel:"gpt-6-luna",reserveSupportGeneration:mock.reserve}));
vi.mock("../lib/widget/answer",async()=>({...await vi.importActual<typeof import('../lib/widget/answer')>("../lib/widget/answer"),generateDocumentationAnswer:mock.model}));
vi.mock("../lib/widget/state",()=>({conversationHistory:async()=>[],recordConversation:async()=>{}}));
vi.mock("../lib/widget/identity",async()=>({...await vi.importActual<typeof import('../lib/widget/identity')>("../lib/widget/identity"),widgetIdentity:async()=>({verified:false,appId:"app-test",customerId:"anonymous",conversationId:"test",facts:{}})}));
import { GET as config } from "../app/api/widget/config/route";
import { POST, OPTIONS } from "../app/api/widget/chat/route";
const app={id:"app_00000000-0000-0000-0000-000000000000",name:"Product",origins:["https://app.example"],documentation:"Invite teammates from the Team menu.",widgetEnabled:true};
function request(method="POST",origin="https://app.example",body:unknown={message:"invite teammates"}){return new Request(`https://talo.example/api/widget/chat?appId=${app.id}`,{method,headers:{Origin:origin,"Content-Type":"application/json"},...(method==="POST"?{body:JSON.stringify(body)}:{})});}
beforeEach(()=>{vi.resetAllMocks();mock.limit.mockResolvedValue([app]);mock.reserve.mockResolvedValue(false);});
it("config exposes only the product name",async()=>{const response=await config(request("GET"));expect(await response.json()).toMatchObject({name:"Product",sessionToken:expect.any(String)});expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");});
it("rejects disallowed origins before model generation",async()=>{const response=await POST(request("POST","https://evil.example"));expect(response.status).toBe(403);expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();expect(mock.reserve).not.toHaveBeenCalled();});
it("rejects disabled or missing applications",async()=>{mock.limit.mockResolvedValue([]);expect((await POST(request())).status).toBe(404);expect(mock.reserve).not.toHaveBeenCalled();});
it("preflight verifies app and origin but never calls the model",async()=>{expect((await OPTIONS(request("OPTIONS"))).status).toBe(204);expect(mock.reserve).not.toHaveBeenCalled();});
it("keeps usable CORS headers on input failures",async()=>{const response=await POST(request("POST","https://app.example",{message:"Hi",tenantId:"victim"}));expect(response.status).toBe(400);expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");});
it("falls back to scoped documentation on model failures",async()=>{mock.reserve.mockResolvedValue(true);mock.model.mockRejectedValue(new Error("private upstream failure"));const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({generation:"documentation",source:app.documentation});});
