import { authenticateRequest } from "../../../lib/public-auth";
import { demoUsers } from "../../../lib/demo/fixtures";
import { loadOwnedCase } from "../../../lib/db/cases";
import { api, ApiError, json } from "../../../lib/http";
import { runtimeConfig } from "../../../lib/runtime";

export const GET = api(async (request) => {
  const config = runtimeConfig();
  const principal = await authenticateRequest(request, config);
  const user = demoUsers.find((item) => item.id === principal.userId);
  const { supportCase: item, storage } = await loadOwnedCase(config, principal, ("caseId" in principal ? principal.caseId : user?.caseId) ?? "");
  if (!item) throw new ApiError(404, "CASE_NOT_FOUND", "This case is unavailable.");
  return json({ invoiceId: item.invoiceId, entitlement: item.entitlement, mode: "fixture", storage });
});
