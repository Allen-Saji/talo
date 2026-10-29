import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Wrangler ignores .env files when .dev.vars exists. Copy runtime service URLs;
// never expose the direct migration URL or print any credential values.
const source = existsSync(".env") ? ".env" : ".env.local";
if (existsSync(source)) {
  const values = parseEnv(readFileSync(source, "utf8"));
  for (const key of ["DATABASE_URL", "NEON_AUTH_BASE_URL"]) {
    const value = values[key];
    if (!value?.trim()) continue;
    let content = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : "";
    const entry = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, "gm");
    content = pattern.test(content)
      ? content.replace(pattern, () => entry)
      : `${content}${content.endsWith("\n") || !content ? "" : "\n"}${entry}\n`;
    writeFileSync(".dev.vars", content, { mode: 0o600 });
    chmodSync(".dev.vars", 0o600);
    console.log(`Synced Neon ${key} into local Worker configuration (value hidden).`);
  }
}
