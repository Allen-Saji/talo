import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateRequest } from "../lib/public-auth";
import { publicIdentity } from "../lib/identity";
import { readConfig } from "../lib/config";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/auth/next/server", () => ({ createNeonAuth: () => ({ getSession }) }));
const config = readConfig({ TALO_PUBLIC_AUTH: "true", TALO_DEMO_MODE: "true", NEON_AUTH_BASE_URL: "https://auth.example.com/auth", NEON_AUTH_COOKIE_SECRET: "test-secret-at-least-thirty-two-characters" });
const request = new Request("https://talo.example/api/support", { headers: { Cookie: "talo_demo_session=pretend-to-be-alex" } });
beforeEach(() => getSession.mockReset());
describe("public identity boundary", () => {
  it("never falls back to fixture identity in public mode", async () => {
    getSession.mockResolvedValue({ data: null, error: null });
    await expect(authenticateRequest(request, config)).rejects.toMatchObject({ status: 401 });
  });
  it("requires verified email", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "user-one", emailVerified: false } }, error: null });
    await expect(authenticateRequest(request, config)).rejects.toMatchObject({ status: 403 });
  });
  it("derives isolated scope from the provider identity and bypasses cached sessions", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "user-one", emailVerified: true } }, error: null });
    const principal = await authenticateRequest(request, config);
    expect(principal).toEqual(publicIdentity("user-one"));
    expect(principal).not.toEqual(publicIdentity("user-two"));
    expect(getSession).toHaveBeenCalledWith({ query: { disableCookieCache: "true" } });
  });
  it("fails closed if session validation is unavailable", async () => {
    getSession.mockResolvedValue({ data: null, error: { message: "private upstream info" } });
    await expect(authenticateRequest(request, config)).rejects.toMatchObject({ status: 503, message: "Sign-in is unavailable." });
  });
});
