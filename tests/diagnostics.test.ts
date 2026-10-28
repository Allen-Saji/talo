import { describe, expect, it } from "vitest";
import { requireDiagnostics } from "../lib/auth";
import { readConfig } from "../lib/config";
import { configurationStatus, runProbe } from "../lib/providers/probes";

const secret = "test-only-diagnostic-key-which-is-long-enough";

describe("diagnostics", () => {
  it("requires explicit local enablement and a valid token", () => {
    const diagnosticConfig = readConfig({ TALO_DIAGNOSTICS_ENABLED: "true", DIAGNOSTICS_TOKEN: secret });
    expect(() => requireDiagnostics(new Request("http://localhost/"), diagnosticConfig)).toThrow();
    expect(() => requireDiagnostics(new Request("https://talo.example/", { headers: { Authorization: `Bearer ${secret}` } }), diagnosticConfig)).toThrow();
    expect(() => requireDiagnostics(new Request("http://localhost/", { headers: { Authorization: `Bearer ${secret}` } }), diagnosticConfig)).not.toThrow();
  });
  it("reports presence without returning secret values", () => {
    const result = configurationStatus(readConfig({ DATABASE_URL: "sensitive-database-url" }));
    expect(result.find((item) => item.provider === "neon")?.configured).toBe(true);
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });
  it.each(["neon", "tatum", "walrus"] as const)("skips %s without credentials", async (provider) => {
    expect(await runProbe(provider, readConfig({}))).toMatchObject({ status: "missing_configuration" });
  });
});
