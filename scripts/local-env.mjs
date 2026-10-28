import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function readLocalEnv(directory = process.cwd()) {
  const values = {};
  const neonFile = existsSync(`${directory}/.env`) ? ".env" : ".env.local";
  for (const name of [".dev.vars", neonFile]) {
    const path = `${directory}/${name}`;
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (value.trim()) values[key] = value;
    }
  }
  return values;
}

export function loadLocalEnv() {
  for (const [key, value] of Object.entries(readLocalEnv())) {
    if (!process.env[key]?.trim()) process.env[key] = value;
  }
}
