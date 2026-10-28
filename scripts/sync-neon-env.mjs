import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Wrangler ignores .env files when .dev.vars exists. Copy only the runtime URL;
// never expose the direct migration URL or print any credential values.
const source = existsSync(".env") ? ".env" : ".env.local";
if (existsSync(source)) {
  const { DATABASE_URL } = parseEnv(readFileSync(source, "utf8"));
  if (DATABASE_URL?.trim()) {
    let content = existsSync(".dev.vars") ? readFileSync(".dev.vars", "utf8") : "";
    const entry = `DATABASE_URL=${JSON.stringify(DATABASE_URL)}`;
    content = /^\s*(?:export\s+)?DATABASE_URL\s*=/m.test(content)
      ? content.replace(/^\s*(?:export\s+)?DATABASE_URL\s*=.*$/gm, () => entry)
      : `${content}${content.endsWith("\n") || !content ? "" : "\n"}${entry}\n`;
    writeFileSync(".dev.vars", content, { mode: 0o600 });
    chmodSync(".dev.vars", 0o600);
    console.log("Synced Neon DATABASE_URL into local Worker configuration (value hidden).");
  }
}
