import { readConfig } from "../lib/config";
import { dispatchMemoryJobs } from "../lib/memory/jobs";

import { purgeExpiredWidgetData } from "../lib/widget/retention";

export default {
  async scheduled(_controller: ScheduledController, env: Record<string, string>) {
    try { const config=readConfig(env); await dispatchMemoryJobs(config); if(new Date(_controller.scheduledTime).getUTCMinutes()===0) await purgeExpiredWidgetData(config); }
    catch { throw new Error("MEMORY_DISPATCH_FAILED"); }
  },
  fetch() { return new Response("Not found", { status: 404 }); },
};
