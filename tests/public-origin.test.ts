import {it,expect} from 'vitest';
import {publicRequestUrl} from '../lib/public-origin';
import {requireSameOrigin} from '../lib/http';
const worker='https://talo.metropolis-frontend.workers.dev';
it('recognizes the exact custom domain behind the configured worker',()=>{const r=new Request(worker+'/dashboard?a=1',{headers:{'x-forwarded-host':'talo.allensaji.dev'}});expect(publicRequestUrl(r).href).toBe('https://talo.allensaji.dev/dashboard?a=1');});
it('preserves CSRF rejection and ignores untrusted proxy hosts',()=>{expect(()=>requireSameOrigin(new Request(worker+'/api/applications',{headers:{Origin:'https://evil.example','x-forwarded-host':'evil.example'}}))).toThrow();expect(()=>requireSameOrigin(new Request(worker+'/api/applications',{headers:{Origin:'https://evil.example','x-forwarded-host':'talo.allensaji.dev'}}))).toThrow();expect(publicRequestUrl(new Request('http://localhost:5175/',{headers:{'x-forwarded-host':'talo.allensaji.dev'}})).origin).toBe('http://localhost:5175');});
it('accepts both legitimate app origins and no other origin',()=>{for(const origin of [worker,'https://talo.allensaji.dev'])expect(()=>requireSameOrigin(new Request(worker+'/api/applications',{headers:{Origin:origin}}))).not.toThrow();});
