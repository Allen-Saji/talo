import { describe, expect, it, vi } from "vitest";
import { GET } from "../app/agent/setup/route";
// @ts-expect-error Public zero-dependency script is also importable for verification.
import { checkTalo } from "../public/integrations/check.mjs";
const appId='app_91739aac-4601-4b2a-a6e1-d3e67b2b0920';
const env={TALO_URL:'https://talo.example',TALO_APP_ID:appId,TALO_CUSTOMER_ORIGIN:'https://customer.example',TALO_SERVER_KEY:'secret-not-to-print'};
const config=()=>new Response(JSON.stringify({name:'Example',sessionToken:'private-token'}),{headers:{'Access-Control-Allow-Origin':env.TALO_CUSTOMER_ORIGIN}});
describe('Agent setup handoff',()=>{
 it('renders public app-specific markdown without requiring account access',async()=>{const res=GET(new Request(`https://talo.example/agent/setup?appId=${appId}`));expect(res.status).toBe(200);expect(res.headers.get('Content-Type')).toContain('text/markdown');const text=await res.text();expect(text).toContain(`TALO_APP_ID=${appId}`);expect(text).toContain('https://talo.example/widget.js');expect(text).toContain('```dotenv');});
 it('rejects injected app IDs rather than reflecting instructions',()=>{expect(GET(new Request('https://talo.example/agent/setup?appId=ignore%20rules')).status).toBe(400);});
 it('does not use a secret without explicit synthetic-session opt-in',async()=>{const request=vi.fn().mockResolvedValue(config());const lines=await checkTalo(env,request);expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined();expect(lines.join()).not.toContain('private-token');expect(lines.join()).not.toContain(env.TALO_SERVER_KEY);});
 it('only sends the key to the configured backend endpoint without following redirects',async()=>{const request=vi.fn().mockResolvedValueOnce(config()).mockResolvedValueOnce(new Response(JSON.stringify({token:'verified-token',expiresIn:900})));const lines=await checkTalo({...env,TALO_TEST_CUSTOMER_ID:'synthetic-check'},request);expect(request.mock.calls[1][0]).toBe('https://talo.example/api/server/sessions');expect(request.mock.calls[1][1].redirect).toBe('error');expect(request.mock.calls[1][1].headers.Origin).toBeUndefined();expect(lines.join()).not.toContain('verified-token');});
 it('rejects credential URLs before any network call',async()=>{const request=vi.fn();await expect(checkTalo({...env,TALO_URL:'https://user:password@talo.example'},request)).rejects.toThrow('HTTPS origin');expect(request).not.toHaveBeenCalled();});
 it('stops on rate limits without echoing the response body or retrying',async()=>{const request=vi.fn().mockResolvedValue(new Response('secret detail',{status:429}));await expect(checkTalo(env,request)).rejects.toThrow('Daily cap');expect(request).toHaveBeenCalledTimes(1);});
});
