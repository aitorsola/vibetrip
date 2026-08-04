import { z } from "zod";

const AccommodationOptionSchema = z.object({
  tipo: z.string().default("Alojamiento"),
  nombre_ejemplo: z.string().default(""),
  zona: z.string().default(""),
  pros: z.preprocess(
    (v) => (typeof v === "string" ? tryParseArray(v) : v),
    z.array(z.string()).default([]),
  ),
  contras: z.preprocess(
    (v) => (typeof v === "string" ? tryParseArray(v) : v),
    z.array(z.string()).default([]),
  ),
});
export type AccommodationOption = z.infer<typeof AccommodationOptionSchema>;

// Local models sometimes return `opciones` as a JSON-stringified array instead
// of an actual array, or wrap it in an extra object. Coerce in those cases.
function tryParseArray(v: string): unknown {
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [v];
  } catch {
    return [v];
  }
}

function coerceOpciones(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(v)) return v;
  // model wrapped it: { opciones: [...] } nested
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj.opciones)) return obj.opciones;
  }
  return v;
}

export const AccommodationSchema = z.object({
  opciones: z.preprocess(coerceOpciones, z.array(AccommodationOptionSchema).min(1)),
});
export type Accommodation = z.infer<typeof AccommodationSchema>;
