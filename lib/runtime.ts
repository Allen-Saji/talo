import { env } from "cloudflare:workers";
import { readConfig } from "./config";
export function runtimeConfig() { return readConfig(env); }

export function knowledgeImporter() { return (env as unknown as { KNOWLEDGE_IMPORT?: Fetcher }).KNOWLEDGE_IMPORT; }
