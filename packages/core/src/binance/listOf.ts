import { z } from "zod";

const LIST_KEYS = ["list", "items", "tokens", "rows", "routes", "data"] as const;

export function listOf<T extends z.ZodTypeAny>(item: T): z.ZodType<Array<z.infer<T>>, z.ZodTypeDef, unknown> {
  return z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of LIST_KEYS) {
        const candidate = record[key];
        if (Array.isArray(candidate)) return candidate;
      }
    }
    return value;
  }, z.array(item));
}

export const stringish: z.ZodType<string | null, z.ZodTypeDef, unknown> = z.preprocess(
  (value) => (value === null || value === undefined ? null : String(value)),
  z.string().nullable(),
);

export const numberish: z.ZodType<number | null, z.ZodTypeDef, unknown> = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : Number(value)),
  z.number().nullable(),
);
