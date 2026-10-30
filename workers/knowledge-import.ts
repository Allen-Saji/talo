// Service-binding only. No secrets, storage, private-network bindings or public route.
import { importPage } from '../lib/knowledge/url-import';
import { api, json, parseBody } from '../lib/http';
import { z } from 'zod';
const handler=api(async request=>{
 if(request.method!=='POST')return new Response(null,{status:405});
 const {url}=await parseBody(request,z.object({url:z.string().max(2000)}).strict(),4096);
 return json(await importPage(url));
});
export default {fetch:handler};
