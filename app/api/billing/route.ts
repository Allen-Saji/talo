import { authenticate } from "../../../lib/auth";
import { demoUsers, findOwnedCase } from "../../../lib/demo/fixtures";
import { api, ApiError, json } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";

export const GET = api(async (request) => {
  const principal = authenticate(request, runtimeConfig());
  const user = demoUsers.find((item) => item.id === principal.userId);
  const item = user && findOwnedCase(principal, user.caseId);
  if (!item) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  return json({ invoiceId: item.invoiceId, entitlement: item.entitlement, mode: "fixture" });
});
