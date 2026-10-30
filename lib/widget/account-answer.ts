import type { WidgetIdentity } from "./identity";
import type { WidgetAnswer } from "./answer";
// Read structured facts directly for simple status questions. A model is not needed
// to restate a trusted backend value or to decide whether an account has a plan.
export function accountAnswer(message:string,identity:WidgetIdentity):WidgetAnswer|undefined{
 if(!identity.verified)return;
 const q=message.toLowerCase();const facts=identity.facts;
 if(facts.plan&&/\b(what|which|current)\b.*\bplan\b|\bplan\b.*\b(am i|current)\b/.test(q))return {answer:`Your account is on the ${facts.plan} plan.`,source:`plan: ${facts.plan}`,generation:'account'};
 if(facts.subscriptionStatus&&/\bsubscription\b.*\b(status|active|canceled|past due|trial)\b/.test(q))return {answer:`Your subscription status is ${facts.subscriptionStatus.replaceAll('_',' ')}. This is a read-only status supplied by the application.`,source:`subscriptionStatus: ${facts.subscriptionStatus}`,generation:'account'};
 if(facts.accountStatus&&/\baccount\b.*\b(status|active|suspended|pending)\b/.test(q))return {answer:`Your account status is ${facts.accountStatus}. This is a read-only status supplied by the application.`,source:`accountStatus: ${facts.accountStatus}`,generation:'account'};
}
