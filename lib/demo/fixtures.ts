export const demoUsers = [
  { id: "alex", name: "Alex", tenantId: "studio", tenantName: "Studio", caseId: "case-alex" },
  { id: "sam", name: "Sam", tenantId: "studio", tenantName: "Studio", caseId: "case-sam" },
  { id: "jules", name: "Jules", tenantId: "fieldwork", tenantName: "Fieldwork", caseId: "case-jules" },
] as const;
export type Principal = { userId: string; tenantId: string };
export type DemoUser = { id: string; name: string; tenantId: string; tenantName: string; caseId: string };
export type SupportCase = {
  id: string; owner: Principal; invoiceId: string;
  entitlement: "pending" | "active"; attempts: string[]; preference: string;
};
export const demoCases: readonly SupportCase[] = [
  { id: "case-alex", owner: { userId: "alex", tenantId: "studio" }, invoiceId: "INV-1042", entitlement: "pending", attempts: ["Refreshing the page did not restore access.", "Signing out and back in did not restore access."], preference: "Keep instructions short." },
  { id: "case-sam", owner: { userId: "sam", tenantId: "studio" }, invoiceId: "INV-1043", entitlement: "active", attempts: ["Switching to the entitled workspace resolved the previous case."], preference: "Give one step at a time." },
  { id: "case-jules", owner: { userId: "jules", tenantId: "fieldwork" }, invoiceId: "INV-2011", entitlement: "pending", attempts: ["Reopening the mobile app did not restore access."], preference: "Use mobile instructions." },
];
export function findOwnedCase(principal: Principal, caseId: string) {
  return demoCases.find((item) => item.id === caseId && item.owner.userId === principal.userId && item.owner.tenantId === principal.tenantId);
}
