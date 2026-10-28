export function GET() {
  return Response.json({
    service: "talo", status: "ok",
  }, { headers: { "Cache-Control": "no-store" } });
}
