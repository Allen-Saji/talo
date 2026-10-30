import { agentSetupGuide } from "../../../lib/agent-setup";
export function GET(request: Request) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId") ?? undefined;
  if (appId && !/^app_[0-9a-f-]{36}$/.test(appId)) return new Response("Invalid application ID", { status: 400 });
  return new Response(agentSetupGuide(url.origin, appId), { headers: {
    "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
