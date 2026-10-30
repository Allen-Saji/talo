import {expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../lib/db/client',()=>({createDatabase:()=>({execute})}));
import {contextUnits,reserveContextBudget,MAX_REQUEST_UNITS} from '../lib/widget/budget';
const config={OPENAI_API_KEY:'test',DATABASE_URL:'test'} as any;
it('charges the entire older history, not only the newest exchanges',()=>{const history=Array.from({length:20},(_,i)=>({role:'user' as const,text:'message '+i}));expect(contextUnits('Guide',{message:'Earlier?',history})).toBeGreaterThan(contextUnits('Guide',{message:'Earlier?',history:history.slice(-6)}));});
it('rejects oversized context before spending or silently truncating it',async()=>{execute.mockClear();const history=Array.from({length:40},()=>({role:'user' as const,text:'x'.repeat(1800)}));expect(contextUnits('Guide',{message:'hi',history})).toBeGreaterThan(MAX_REQUEST_UNITS);expect(await reserveContextBudget(config,'app','Guide',{message:'hi',history})).toBe(false);expect(execute).not.toHaveBeenCalled();});
it('fails closed when the shared database reservation is exhausted',async()=>{execute.mockResolvedValue({rows:[]});expect(await reserveContextBudget(config,'app','Guide',{message:'hi'})).toBe(false);execute.mockResolvedValue({rows:[{requests:100}]});expect(await reserveContextBudget(config,'app','Guide',{message:'hi'})).toBe(true);});
