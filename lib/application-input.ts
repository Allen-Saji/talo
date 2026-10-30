import { z } from "zod";

export const originSchema = z.string().trim().max(250).transform((value, ctx) => {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.includes("*")) throw new Error();
    return url.origin;
  } catch { ctx.addIssue({ code: "custom", message: "Use an HTTPS origin without a path, for example https://app.example.com. HTTP is allowed for localhost." }); return z.NEVER; }
});
export const applicationInput = z.object({
  name: z.string().trim().min(1).max(80),
  origins: z.array(originSchema).min(1).max(5).transform(values => [...new Set(values)]),
  documentation: z.string().trim().min(30).max(5000),
  widgetEnabled: z.boolean().default(false),
  revision: z.number().int().min(0),
}).strict();
export type ApplicationInput = z.input<typeof applicationInput>;
export type Application = { id: string; tenantId: string; name: string; origins: string[]; documentation: string; widgetEnabled: boolean; revision: number; createdAt: string; updatedAt: string };
