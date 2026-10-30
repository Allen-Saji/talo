import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), workspace: vi.fn(), store: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock("../lib/runtime", () => ({ runtimeConfig: () => ({ TALO_PUBLIC_AUTH:true, DATABASE_URL:"synthetic" }) }));
vi.mock("../lib/public-auth", () => ({ publicSession:mocks.session, ensureAccountWorkspace:mocks.workspace }));
vi.mock("../lib/applications", async () => ({ applicationInput:(await import("../lib/application-input")).applicationInput, applicationStore:mocks.store }));
import { GET, PUT } from "../app/api/applications/route";
const input = { name:"Test", origins:["https://example.com"], documentation:"Useful support documentation for this application.", revision:0 };
function request(body: unknown, origin="https://talo.example") { return new Request("https://talo.example/api/applications",{method:"PUT",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)}); }
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({id:"verified-user",emailVerified:true,name:"Customer"}); mocks.store.mockResolvedValue({get:mocks.get,save:mocks.save}); });
it("rejects unauthenticated reads and writes",async()=>{ mocks.session.mockResolvedValue(null); expect((await GET(new Request("https://talo.example/api/applications"))).status).toBe(401); expect((await PUT(request(input))).status).toBe(401); expect(mocks.store).not.toHaveBeenCalled(); });
it("rejects unverified users",async()=>{mocks.session.mockResolvedValue({id:"unverified",emailVerified:false});expect((await PUT(request(input))).status).toBe(403);expect(mocks.workspace).not.toHaveBeenCalled();});
it("rejects cross-origin writes before authentication",async()=>{expect((await PUT(request(input,"https://evil.example"))).status).toBe(403);expect(mocks.session).not.toHaveBeenCalled();});
it("rejects ownership injection",async()=>{expect((await PUT(request({...input,tenantId:"victim"}))).status).toBe(400);expect(mocks.save).not.toHaveBeenCalled();});
it("accepts full-length Unicode documentation within the route limit",async()=>{mocks.save.mockResolvedValue({id:"app-test"});expect((await PUT(request({...input,documentation:"文".repeat(50000)}))).status).toBe(200);expect(mocks.save).toHaveBeenCalledOnce();});
it("enforces a byte limit on oversized input",async()=>{expect((await PUT(request({...input,documentation:"x".repeat(240001)}))).status).toBe(413);expect(mocks.save).not.toHaveBeenCalled();});
