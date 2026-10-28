import { env } from "cloudflare:workers";
import { readConfig } from "./config";
export function runtimeConfig() { return readConfig(env); }
