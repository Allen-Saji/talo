export const KNOWLEDGE_LIMIT = 50_000;
export type Finding = { code: string; message: string };
export function scanKnowledge(text: string): Finding[] {
  const normalized = text.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '').toLowerCase();
  const findings: Finding[] = [];
  const rules: Array<[string, string, RegExp]> = [
    ['instruction-override','Possible instructions aimed at the assistant. Remove them before adding this content.', /(?:ignore|disregard|override|forget|bypass)[\s\S]{0,70}(?:previous|prior|system|developer|instructions|safety|rules)|(?:system|developer)\s*(?:prompt|message)\s*[:=]|<\|(?:im_start|system|endoftext)\|>|\[inst\]|you are now\b|act as (?:an? )?(?:unrestricted|system|developer)/i],
    ['data-exfiltration','Possible request to expose credentials or private data.', /(?:reveal|print|exfiltrate|leak|send|upload)[\s\S]{0,100}(?:api[ _-]?key|secret|password|system prompt|access token|private key)|(?:fetch|curl|wget)[\s\S]{0,80}(?:token|secret|password)/i],
    ['credential','This content appears to contain credentials. Remove them and rotate any exposed real secret.', /-----begin (?:rsa |ec |openssh )?private key-----|\b(?:sk-(?:proj-)?[a-z0-9_-]{20,}|talo_sk_[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{20,}|akia[a-z0-9]{16})\b|(?:password|api[_ -]?key|secret|access[_ -]?token)\s*[:=]\s*["']?[a-z0-9/+_-]{16,}/i],
    ['active-content','Executable or embedded content is not support knowledge.', /<\s*(?:script|iframe|object|embed)\b|javascript\s*:|data\s*:\s*text\/html/i],
    ['encoded-payload','Long encoded data is not accepted. Use readable support text.', /\b[a-z0-9+/]{200,}={0,2}\b/i],
  ];
  for (const [code,message,pattern] of rules) if (pattern.test(normalized)) findings.push({code,message});
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(text)) findings.push({code:'hidden-content',message:'Hidden control characters detected. Remove them before adding this text.'});
  return findings;
}
export function relevantKnowledge(documentation: string, question: string, max = 8000) {
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(t=>!['the','and','what','how','does','your','this','can','for','with'].includes(t));
  const chunks = documentation.split(/\n\s*\n/).flatMap(p=>p.match(/[\s\S]{1,1200}/g)??[]);
  const ranked = chunks.map((text,index)=>({text,index,score:terms.filter(t=>text.toLowerCase().includes(t)).length})).sort((a,b)=>b.score-a.score||a.index-b.index);
  let result='';
  for(const {text} of ranked) { if(result.length+text.length+2>max)continue;result+=(result?'\n\n':'')+text; }
  return result;
}
