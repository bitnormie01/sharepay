import { createHmac } from "node:crypto";

export type HttpMethod = "GET" | "POST";

export function signPayload(input: {
  timestamp: string;
  method: HttpMethod;
  requestPath: string;
  body: string;
  secretKey: string;
}): string {
  const preHash = `${input.timestamp}${input.method}${input.requestPath}${input.body}`;
  return createHmac("sha256", input.secretKey).update(preHash, "utf8").digest("base64");
}

export function encodeQuery(query: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    const encodedValue = encodeURIComponent(value).replace(/%2C/gi, ",");
    parts.push(`${encodeURIComponent(key)}=${encodedValue}`);
  }
  return parts.join("&");
}
