import { randomBytes } from "node:crypto";
import { open } from "node:fs/promises";

try {
  const file = await open(".dev.vars", "wx", 0o600);
  try {
    await file.writeFile([
      "TALO_DEMO_MODE=true", "TALO_DIAGNOSTICS_ENABLED=true",
      `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
      `DIAGNOSTICS_TOKEN=${randomBytes(32).toString("hex")}`, "",
    ].join("\n"));
  } finally { await file.close(); }
  console.log("Created .dev.vars with local-only secrets. No secret values printed.");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
    console.log("Existing .dev.vars preserved.");
  } else { throw new Error("Local configuration could not be created."); }
}
