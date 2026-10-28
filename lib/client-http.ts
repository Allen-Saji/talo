import { z } from "zod";

const errorResponse = z.object({ error: z.object({ message: z.string() }) });
export async function requestJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = errorResponse.safeParse(result);
    throw new Error(error.success ? error.data.error.message : "The request failed. Try again.");
  }
  return result as T;
}
