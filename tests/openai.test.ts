import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSupportAnswer, supportModelRequest } from "../lib/providers/openai";
import { readConfig } from "../lib/config";
import { answerSupport } from "../lib/support";
afterEach(() => vi.unstubAllGlobals());
const context = answerSupport({ tenantId: "studio", userId: "alex" }, "case-alex", "paid");
const config = readConfig({ OPENAI_API_KEY: "test-only" });
const response = (body: unknown) => new Response(JSON.stringify(body));
describe("bounded OpenAI support generation", () => {
  it("uses Luna, disables storage, and gives the model no action tools", () => {
    const body = supportModelRequest("paid", context);
    expect(body).toMatchObject({ model: "gpt-6-luna", store: false, max_output_tokens: 800 });
    expect(body).not.toHaveProperty("tools");
    expect(body.text.format.strict).toBe(true);
  });
  it("accepts only a completed structured assistant answer", async () => {
    const transport = vi.fn().mockResolvedValue(response({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ answer: "The fixture payment matches; access is pending.", evidence: ["payment", "entitlement"] }) }] }] }));
    expect(await generateSupportAnswer(config, "paid", context, transport)).toMatchObject({ evidence: ["payment", "entitlement"] });
    expect(transport.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    expect(transport.mock.calls[0][1].redirect).toBe("manual");
  });
  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "function_call", name: "grant_access" }] },
    { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] }] },
    { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"answer":"x","evidence":["other-user"]}' }] }] },
  ])("fails closed on invalid output", async (body) => {
    await expect(generateSupportAnswer(config, "paid", context, vi.fn().mockResolvedValue(response(body)))).rejects.toThrow();
  });
  it("makes no paid retry after an upstream error", async () => {
    const transport = vi.fn().mockResolvedValue(new Response("sensitive-details", { status: 429 }));
    await expect(generateSupportAnswer(config, "paid", context, transport)).rejects.toThrow("MODEL_HTTP_429");
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

it("preserves the global fetch receiver required by Workers", async () => {
  vi.stubGlobal("fetch", function (this: unknown) {
    expect(this).toBe(globalThis);
    return Promise.resolve(response({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"answer":"Synthetic access is pending.","evidence":["entitlement"]}' }] }] }));
  });
  expect(await generateSupportAnswer(config, "paid", context)).toMatchObject({ evidence: ["entitlement"] });
});

it("rejects redirects without forwarding the API credential", async () => {
  const transport = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://other.example" } }));
  await expect(generateSupportAnswer(config, "paid", context, transport)).rejects.toThrow("MODEL_HTTP_302");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][1].redirect).toBe("manual");
});
