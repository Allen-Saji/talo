import { readConfig } from "../lib/config";
import { dispatchMemoryJobs } from "../lib/memory/jobs";

export default {
  async scheduled(_controller: ScheduledController, env: Record<string, string>) {
    try { await dispatchMemoryJobs(readConfig(env)); }
    catch { throw new Error("MEMORY_DISPATCH_FAILED"); }
  },
  fetch() { return new Response("Not found", { status: 404 }); },
};
