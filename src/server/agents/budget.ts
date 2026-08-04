import "server-only";
import type { Budget } from "@/domain/budget";
import type { Itinerary } from "@/domain/itinerary";
import type { DestinationSegment, Member } from "@/domain/trip";

/**
 * Pure calculation — only sums activity costs from the itinerary.
 * Accommodation, flights, meals and local transport are intentionally omitted:
 * no reliable free data source, and inventing prices misleads the user.
 */
export function runBudgetAgent(
  trip: DestinationSegment,
  members: Member[],
  itinerary: Itinerary,
): Budget {
  const actividades_total_persona = itinerary.itinerario.reduce(
    (sum, day) => sum + day.actividades.reduce((s, a) => s + (a.coste_persona ?? 0), 0),
    0,
  );

  const total_persona = Math.round(actividades_total_persona);
  const total_grupo = total_persona * members.length;

  return {
    presupuesto: {
      actividades_total_persona: Math.round(actividades_total_persona),
      total_persona,
      total_grupo,
      dentro_presupuesto: total_persona <= trip.budget,
    },
  };
}
