import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../lib/config";
import { loadOwnedCase } from "../lib/db/cases";

const principal = { userId: "alex", tenantId: "studio" };
const config = readConfig({ DATABASE_URL: "postgresql://test:test@ep-test.us-east-2.aws.neon.tech/test" });
afterEach(() => vi.unstubAllGlobals());

describe("case persistence", () => {
  it("uses fixtures only when the database is unconfigured", async () => {
    const result = await loadOwnedCase(readConfig({}), principal, "case-alex");
    expect(result.storage).toBe("fixture");
    expect(result.supportCase?.invoiceId).toBe("INV-1042");
  });
  it("sends parameterized case, tenant, and user scope to Postgres", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ fields: [], rows: [], rowCount: 0 }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const result = await loadOwnedCase(config, principal, "case-sam");
    expect(result).toEqual({ storage: "neon", supportCase: undefined });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.params).toEqual(["case-sam", "studio", "alex", "1"]);
    expect(body.query).toContain('"support_cases"."tenantId" = $2');
    expect(body.query).toContain('"support_cases"."userId" = $3');
  });
  it("does not return fixtures when the configured database fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    await expect(loadOwnedCase(config, principal, "case-alex")).rejects.toThrow();
  });
});
