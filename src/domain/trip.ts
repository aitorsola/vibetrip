import { z } from "zod";
import { ByokSchema } from "./llm";

export const FoodPreferenceSchema = z.enum([
  "Sin restricciones",
  "Vegetariano",
  "Vegano",
  "Sin gluten",
  "Halal",
  "Sin lactosa",
]);
export type FoodPreference = z.infer<typeof FoodPreferenceSchema>;

export const PaceSchema = z.enum([
  "Tranquilo (2-3 actividades/día)",
  "Moderado (4-5 actividades/día)",
  "Intenso (6+ actividades/día)",
]);
export type Pace = z.infer<typeof PaceSchema>;

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  interests: z.array(z.string()).min(1),
  food: FoodPreferenceSchema,
  pace: PaceSchema,
  notes: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const DestinationSegmentSchema = z
  .object({
    destination: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    budget: z.number().int().positive(),
    includeAccommodation: z.boolean().default(true),
  })
  .refine((t) => new Date(t.startDate) <= new Date(t.endDate), {
    message: "endDate must be on/after startDate",
    path: ["endDate"],
  });
export type DestinationSegment = z.infer<typeof DestinationSegmentSchema>;

export const PlanRequestSchema = z.object({
  destinations: z.array(DestinationSegmentSchema).min(1).max(5),
  members: z.array(MemberSchema).min(1),
  // Optional BYOK override. Absent (e.g. iOS clients) → server default model.
  llm: ByokSchema.optional(),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export function nightsBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  // Same-day trip → 0 nights → 1 day. The previous floor of 1 forced
  // 1 night → 2 days for a single-day excursion.
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function totalNights(destinations: DestinationSegment[]): number {
  return destinations.reduce(
    (sum, d) => sum + nightsBetween(d.startDate, d.endDate),
    0,
  );
}

/** Total planned days across all destinations (each segment is nights + 1).
 *  Drives the default-model length cap. */
export function totalDays(destinations: DestinationSegment[]): number {
  return destinations.reduce(
    (sum, d) => sum + nightsBetween(d.startDate, d.endDate) + 1,
    0,
  );
}

/** Trips longer than this require the user's own API key — the free default
 *  model is capped to keep its cost/latency bounded. */
export const MAX_DEFAULT_MODEL_DAYS = 4;
