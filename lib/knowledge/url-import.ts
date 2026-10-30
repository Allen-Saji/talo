import ipaddr from 'ipaddr.js';
import { Parser } from 'htmlparser2';
import { ApiError } from '../http';
import { KNOWLEDGE_LIMIT } from './safety';
export function publicUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(400,'INVALID_URL','Enter a public HTTPS page URL.'); }
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||url.search||!host.includes('.')||host.endsWith('.')||ipaddr.isValid(host.replace(/^\[|\]$/g,''))||/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host))throw new ApiError(400,'INVALID_URL','Use a public HTTPS hostname without credentials, query parameters, fragments, or a custom port.');
  return url;
}
export function isPublicAddress(value: string) { try { return ipaddr.parse(value).range()==='unicast'; } catch { return false; } }
export async function boundedText(response: Response, maxBytes: number) {
  if(Number(response.headers.get('Content-Length'))>maxBytes){await response.body?.cancel();throw new ApiError(413,'SOURCE_TOO_LARGE','This page is too large. Import a smaller page or paste the relevant text.');}
  const reader=response.body?.getReader();if(!reader)throw new ApiError(400,'EMPTY_SOURCE','The page has no readable content.');
  const chunks:Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new ApiError(413,'SOURCE_TOO_LARGE','This page is too large. Import a smaller page.');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function htmlText(html: string) {
  const skip=new Set(['script','style','noscript','iframe','object','embed','svg','canvas','nav','footer','form','template','head']);
  const block=new Set(['p','div','article','section','h1','h2','h3','h4','li','br','tr','pre']);
  let hidden=0;const stack:boolean[]=[];const text:string[]=[];
  const parser=new Parser({onopentag(name,attrs){const blocked=skip.has(name)||'hidden'in attrs||attrs['aria-hidden']==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b)/i.test(attrs.style??'');stack.push(blocked);if(blocked)hidden++;if(!hidden&&block.has(name))text.push('\n\n');},ontext(value){if(!hidden)text.push(value);},onclosetag(name){const blocked=stack.pop();if(blocked)hidden--;if(!hidden&&block.has(name))text.push('\n\n');}},{decodeEntities:true});
  parser.write(html);parser.end();return text.join('').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export async function importPage(value: string, transport:typeof fetch=fetch) {
  const url=publicUrl(value);
  // Fail closed on public DNS checks. Never forward cookies/auth or follow redirects.
  const records=await Promise.all(['A','AAAA'].map(async type=>{
    const dns=await transport(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`,{headers:{Accept:'application/dns-json'},redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(!dns.ok)throw new ApiError(400,'DNS_FAILED','Could not verify this public hostname.');
    const data=JSON.parse(await boundedText(dns,16384)) as {Status:number;Answer?:Array<{type:number;data:string}>};
    if(data.Status!==0)throw new ApiError(400,'DNS_FAILED','Could not verify this public hostname.');
    return (data.Answer??[]).filter(r=>r.type===1||r.type===28).map(r=>r.data);
  }));
  const addresses=records.flat();if(!addresses.length||addresses.some(ip=>!isPublicAddress(ip)))throw new ApiError(400,'PRIVATE_ADDRESS','Private, reserved and local addresses cannot be imported.');
  const response=await transport(url.toString(),{method:'GET',redirect:'manual',credentials:'omit',headers:{Accept:'text/html, text/plain, text/markdown','User-Agent':'Talo-Knowledge-Importer/1.0'},signal:AbortSignal.timeout(10000)});
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new ApiError(400,'REDIRECT_BLOCKED','This URL redirects. Paste the final public page URL instead.');}
  if(!response.ok){await response.body?.cancel();throw new ApiError(400,'FETCH_FAILED','This page could not be imported. Use a public page or upload its text.');}
  const type=response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if(!['text/html','text/plain','text/markdown'].includes(type??'')){await response.body?.cancel();throw new ApiError(415,'UNSUPPORTED_SOURCE','Import an HTML/text page. Download PDFs and use the file upload option.');}
  const raw=await boundedText(response,1024*1024);const text=type==='text/html'?htmlText(raw):raw.trim();
  if(text.length<30)throw new ApiError(400,'EMPTY_SOURCE','Not enough readable text. JavaScript-only pages are not supported; upload or paste the documentation.');
  if(text.length>KNOWLEDGE_LIMIT)throw new ApiError(413,'TEXT_TOO_LARGE','This page exceeds 50,000 characters. Import a smaller section.');
  return {text,source:url.toString()};
}
