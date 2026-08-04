import { z } from "zod";

// Only fields derived from real data:
//   - actividades_total_persona: sum of coste_persona across all itinerary activities.
// Accommodation, flights, meals, and local transport are not included — no
// reliable free data source for them.
export const BudgetSchema = z.object({
  presupuesto: z.object({
    actividades_total_persona: z.number().nonnegative(),
    total_persona: z.number().nonnegative(),
    total_grupo: z.number().nonnegative(),
    dentro_presupuesto: z.boolean(),
  }),
});
export type Budget = z.infer<typeof BudgetSchema>;
