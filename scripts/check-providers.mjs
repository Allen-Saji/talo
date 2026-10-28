import { existsSync } from "node:fs";

if (existsSync(".dev.vars")) process.loadEnvFile(".dev.vars");
const origin = process.env.TALO_LOCAL_URL ?? "http://localhost:5173";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Use a local Workers URL.");
if (!process.env.DIAGNOSTICS_TOKEN) {
  console.error("DIAGNOSTICS_TOKEN is missing. Configure .dev.vars locally.");
  process.exitCode = 1;
} else {
  const headers = { Authorization: `Bearer ${process.env.DIAGNOSTICS_TOKEN}`, Origin: new URL(origin).origin, "Content-Type": "application/json" };
  const configuration = await fetch(`${origin}/api/diagnostics`, { headers });
  if (!configuration.ok) throw new Error(`Diagnostics unavailable (HTTP ${configuration.status}).`);
  const data = await configuration.json();
  const live = process.argv.includes("--live");
  for (const item of data.providers) {
    if (item.provider !== "imports" && (!live || !item.configured)) {
      console.log(`${item.provider}: ${item.configured ? "configured; live check not requested" : "missing " + item.missing.join(", ")}`);
      if (live && !item.configured) process.exitCode = 1;
      continue;
    }
    const response = await fetch(`${origin}/api/diagnostics`, { method: "POST", headers, body: JSON.stringify({ provider: item.provider }) });
    if (!response.ok) throw new Error(`Diagnostic request failed (HTTP ${response.status}).`);
    const result = await response.json();
    console.log(`${result.provider}: ${result.status} (${result.code})`);
    if (result.status === "failed") process.exitCode = 1;
  }
}
