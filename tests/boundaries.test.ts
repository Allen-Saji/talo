import { describe, expect, it } from "vitest";
import { z } from "zod";
import { authenticate, issueSession, requireLocalDemo, verifySession } from "../lib/auth";
import { readConfig } from "../lib/config";
import { api, parseBody, requireSameOrigin } from "../lib/http";
import { answerSupport } from "../lib/support";

const secret = "test-only-session-key-which-is-long-enough";
const config = readConfig({ TALO_DEMO_MODE: "true", SESSION_SECRET: secret });
const principal = { userId: "alex", tenantId: "studio" };

describe("signed local sessions", () => {
  it("derives membership from a verified fixture identity", () => {
    const token = issueSession("alex", secret);
    const request = new Request("http://localhost/api/support", { headers: { Cookie: `talo_demo_session=${token}` } });
    expect(authenticate(request, config)).toEqual(principal);
  });
  it("rejects a modified payload, wrong key, expired token, and unknown user", () => {
    const token = issueSession("alex", secret, 1000);
    expect(verifySession(token, secret, 2000)?.id).toBe("alex");
    expect(verifySession(token, "other-key", 2000)).toBeUndefined();
    expect(verifySession(token, secret, 1000 + 8 * 3600 * 1000)).toBeUndefined();
    expect(verifySession(issueSession("other-user", secret), secret)).toBeUndefined();
    const payload = Buffer.from(JSON.stringify({ userId: "jules", expiresAt: Date.now() + 100000 })).toString("base64url");
    expect(verifySession(`${payload}.${token.split(".")[1]}`, secret)).toBeUndefined();
  });
  it("does not expose the fixture identity selector on a deployed hostname", () => {
    expect(() => requireLocalDemo(new Request("https://talo.example/api/session"), config)).toThrow("unavailable");
    expect(() => requireLocalDemo(new Request("http://localhost/api/session"), readConfig({}))).toThrow("unavailable");
  });
});

describe("support case ownership", () => {
  it("separates payment, access, and fixture memory", () => {
    const answer = answerSupport(principal, "case-alex", "I paid but access is missing");
    expect(answer.evidence.payment.invoiceMatch).toBe("match");
    expect(answer.evidence.entitlement.status).toBe("pending");
    expect(answer.evidence.memory.persisted).toBe(false);
    expect(answer.attempts).toHaveLength(2);
    expect(answer.handoff.status).toBe("prepared");
  });
  it.each(["case-sam", "case-jules", "missing"])("rejects inaccessible case %s", (caseId) => {
    expect(() => answerSupport(principal, caseId, "Show payment")).toThrow("unavailable");
  });
  it("checks tenant and user together", () => {
    expect(() => answerSupport({ userId: "alex", tenantId: "fieldwork" }, "case-alex", "access")).toThrow("unavailable");
  });
  it("does not invent answers outside the supported case", () => {
    expect(answerSupport(principal, "case-alex", "What is the weather?").answer).toContain("local version");
  });
});

describe("request boundaries", () => {
  it("rejects another origin", () => {
    expect(() => requireSameOrigin(new Request("http://localhost/api/session", { headers: { Origin: "https://outside.example" } }))).toThrow();
  });
  it("rejects extra scope fields and oversized streams", async () => {
    const schema = z.object({ message: z.string() }).strict();
    const request = (body: unknown) => new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await expect(parseBody(request({ message: "hello", tenantId: "other" }), schema)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(parseBody(request({ message: "x".repeat(9000) }), schema)).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
  });
  it("redacts unknown provider errors", async () => {
    const handler = api(async () => { throw new Error("sensitive-token-and-customer-content"); });
    const response = await handler(new Request("http://localhost/"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("sensitive");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
