import { describe, expect, it } from "vitest";
import { applicationInput, originSchema } from "../lib/application-input";
const valid = { name: "Acme", origins: ["https://app.example.com"], documentation: "Invite a teammate by opening Settings and selecting Team.", revision: 0 };
describe("application configuration boundary", () => {
  it("normalizes explicit origins and deduplicates", () => {
    expect(applicationInput.parse({ ...valid, origins: ["https://APP.example.com/", "https://app.example.com"] }).origins).toEqual(["https://app.example.com"]);
  });
  it.each(["http://app.example.com", "https://app.example.com/docs", "https://user:pass@app.example.com", "https://*.example.com", "javascript:alert(1)", "https://app.example.com?token=x", "https://app.example.com/#x"])("rejects unsafe or non-origin input %s", value => {
    expect(originSchema.safeParse(value).success).toBe(false);
  });
  it("allows local development with explicit ports", () => {
    expect(originSchema.parse("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it("rejects client-supplied ownership and app IDs", () => {
    expect(applicationInput.safeParse({ ...valid, tenantId: "another-tenant" }).success).toBe(false);
    expect(applicationInput.safeParse({ ...valid, id: "another-app" }).success).toBe(false);
  });
  it("bounds documents and origins", () => {
    expect(applicationInput.safeParse({ ...valid, documentation: "x".repeat(5001) }).success).toBe(false);
    expect(applicationInput.safeParse({ ...valid, origins: [] }).success).toBe(false);
    expect(applicationInput.safeParse({ ...valid, revision: -1 }).success).toBe(false);
  });
});
