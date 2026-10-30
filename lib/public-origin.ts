// Only these two hostnames serve this application. Never trust arbitrary forwarded hosts.
const workerOrigin='https://talo.metropolis-frontend.workers.dev';
const siteOrigin='https://talo.allensaji.dev';
export function publicRequestUrl(request:Request){
 const url=new URL(request.url);
 if(url.origin===workerOrigin && (request.headers.get('x-forwarded-host')==='talo.allensaji.dev'||request.headers.get('Origin')===siteOrigin)){
  url.hostname='talo.allensaji.dev';url.protocol='https:';url.port='';
 }
 return url;
}
