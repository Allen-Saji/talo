export type InsightRow={id:string;customerId:string;verified:boolean;question:string|null;status:string;customerOutcome:string|null;createdAt:Date|string};
export const topics=[
 {id:'invitations',title:'Team invitations',pattern:/\b(invites?|invitations?|teammates?|members?)\b/i,suggestion:'Check whether invitations are easy to find and whether the guide explains roles and permissions.'},
 {id:'exports',title:'Reports and exports',pattern:/\b(exports?|reports?|csv|downloads?)\b/i,suggestion:'Review export failures, plan requirements and the instructions beside the export control.'},
 {id:'billing',title:'Billing and plans',pattern:/\b(bill|billing|paid|payment|refunds?|invoices?|subscriptions?|plans?|charges?)\b/i,suggestion:'Check whether billing status and plan limits are clear before customers contact support.'},
 {id:'access',title:'Sign-in and access',pattern:/\b(login|log in|sign in|signin|password|access|permission|locked)\b/i,suggestion:'Review authentication errors and make the next recovery step visible in the product.'},
 {id:'performance',title:'Errors and performance',pattern:/\b(slow|loading|crash|error|broken|timeout|failed)\b/i,suggestion:'Compare these reports with application errors and response times before choosing a fix.'},
 {id:'setup',title:'Setup and integration',pattern:/\b(install|setup|integrat\w*|configuration|configure|api|widget)\b/i,suggestion:'Check the setup instructions and error messages against the questions customers are asking.'},
 {id:'other',title:'Other questions',pattern:/.*/,suggestion:'Review the linked conversations to identify a more specific problem before changing the product.'},
];
export function summarize(rows:InsightRow[],days:number,now=new Date(),truncated=false){
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-days+1));
 const filtered=rows.filter(r=>new Date(r.createdAt)>=start&&new Date(r.createdAt)<=now);
 const verifiedCounts=new Map<string,number>();for(const r of filtered)if(r.verified)verifiedCounts.set(r.customerId,(verifiedCounts.get(r.customerId)??0)+1);
 const daily=Array.from({length:days},(_,index)=>({date:new Date(start.getTime()+index*86400000).toISOString().slice(0,10),count:0}));
 for(const r of filtered){const day=daily.find(d=>d.date===new Date(r.createdAt).toISOString().slice(0,10));if(day)day.count++;}
 const groups=topics.map(topic=>{
  const matching=filtered.filter(r=>topics.find(t=>t.pattern.test(r.question??''))?.id===topic.id);
  return {id:topic.id,title:topic.title,conversations:matching.length,verifiedCustomers:new Set(matching.filter(r=>r.verified).map(r=>r.customerId)).size,needsHuman:matching.filter(r=>r.status==='needs_human').length,helped:matching.filter(r=>r.customerOutcome==='helped').length,stillStuck:matching.filter(r=>r.customerOutcome==='still_stuck').length,suggestion:matching.length>=3?topic.suggestion:null,evidence:matching.slice(0,5).map(r=>({id:r.id,question:(r.question??'No retained question').slice(0,240),createdAt:new Date(r.createdAt).toISOString()}))};
 }).filter(g=>g.conversations>0).sort((a,b)=>b.conversations-a.conversations);
 const helped=filtered.filter(r=>r.customerOutcome==='helped').length;const stillStuck=filtered.filter(r=>r.customerOutcome==='still_stuck').length;
 return {days,start:start.toISOString(),generatedAt:now.toISOString(),truncated,total:filtered.length,verifiedCustomers:verifiedCounts.size,anonymousConversations:filtered.filter(r=>!r.verified).length,repeatCustomers:[...verifiedCounts.values()].filter(n=>n>1).length,needsHuman:filtered.filter(r=>r.status==='needs_human').length,operatorResolved:filtered.filter(r=>r.status==='resolved').length,helped,stillStuck,unknown:filtered.length-helped-stillStuck,daily,topics:groups};
}
export type InsightSummary=ReturnType<typeof summarize>;
