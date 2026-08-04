import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DestinationSegment, Member } from "@/domain/trip";
import type { PlanResult } from "@/domain/plan";

/** Cap on how many trips to summarise in the system prompt. Newer first. */
const TRIPS_SUMMARY_CAP = 10;

interface TripSummaryRow {
  id: string;
  destinations: DestinationSegment[];
  members: Member[];
  created_at: string;
}

interface TripFullRow extends TripSummaryRow {
  result: PlanResult | null;
}

/**
 * Build the context block we paste into the chat system prompt so the LLM
 * knows what trips the user has planned. Always includes a compact summary
 * of (up to) the user's most recent trips. If `focusedTripId` is set and the
 * caller owns it, also includes that trip's full plan in detail.
 *
 * RLS on the `trips` table makes the queries safe — a non-owner gets no rows.
 */
export async function buildTripsContext(
  supabase: SupabaseClient,
  focusedTripId: string | null,
): Promise<string> {
  const [{ data: summaryRows }, focusedRow] = await Promise.all([
    supabase
      .from("trips")
      .select("id, destinations, members, created_at")
      .order("created_at", { ascending: false })
      .limit(TRIPS_SUMMARY_CAP),
    focusedTripId
      ? supabase
          .from("trips")
          .select("id, destinations, members, result, created_at")
          .eq("id", focusedTripId)
          .maybeSingle()
      : Promise.resolve({ data: null as TripFullRow | null }),
  ]);

  const summaries = (summaryRows ?? []) as TripSummaryRow[];
  const focused = (focusedRow?.data ?? null) as TripFullRow | null;

  if (summaries.length === 0 && !focused) return "";

  const parts: string[] = [];
  parts.push("--- USER CONTEXT ---");

  if (summaries.length > 0) {
    parts.push("Trips this user has planned (most recent first):");
    summaries.forEach((t, i) => {
      const dests = t.destinations
        .map((d) => `${d.destination} (${d.startDate} → ${d.endDate})`)
        .join(" + ");
      const travellers =
        t.members.length === 1 ? "1 traveler" : `${t.members.length} travelers`;
      const focusTag = t.id === focusedTripId ? "  ← FOCUS OF THIS CONVERSATION" : "";
      parts.push(`  ${i + 1}. ${dests} · ${travellers}${focusTag}`);
    });
  }

  if (focused?.result) {
    parts.push("");
    parts.push(
      "Detailed plan for the FOCUSED trip (use it to answer specific questions about days, activities, lodging, budget):",
    );
    parts.push(formatTripDetail(focused));
  }

  parts.push("--- END USER CONTEXT ---");
  return parts.join("\n");
}

function formatTripDetail(trip: TripFullRow): string {
  const result = trip.result;
  if (!result) return "";
  const out: string[] = [];

  out.push(
    "Travelers: " +
      trip.members
        .map(
          (m) =>
            `${m.name} (interests: ${m.interests.join(", ") || "—"}, food: ${m.food}, pace: ${m.pace}${m.notes ? `, notes: ${m.notes}` : ""})`,
        )
        .join("; "),
  );

  const c = result.consensus.consenso;
  out.push(
    `Group consensus: pace ${c.ritmo_ideal}; common interests: ${c.intereses_comunes.join(", ") || "varied"}; dietary restrictions: ${c.restricciones_alimentarias.join(", ") || "none"}.`,
  );

  result.destinations.forEach((dr, i) => {
    const seg = trip.destinations[i];
    if (!seg) return;
    out.push("");
    out.push(`# ${seg.destination.toUpperCase()} (${seg.startDate} → ${seg.endDate})`);

    out.push("Itinerary:");
    dr.itinerary.itinerario.forEach((day) => {
      out.push(
        `  Day ${day.dia} — ${day.titulo}${day.zona ? ` (${day.zona})` : ""}`,
      );
      day.actividades.forEach((a) => {
        const cost = a.coste_persona ? `, ${a.coste_persona}€` : "";
        out.push(
          `    ${a.hora} ${a.nombre} [${a.tipo}${cost}]${a.descripcion ? ` — ${a.descripcion}` : ""}`,
        );
      });
    });

    if (dr.accommodation) {
      out.push("Accommodation options:");
      dr.accommodation.opciones.forEach((op) => {
        out.push(`  ${op.tipo}: ${op.nombre_ejemplo} — ${op.zona}`);
      });
    }

    out.push(
      `Budget: ${dr.budget.presupuesto.total_persona}€/person, ${dr.budget.presupuesto.total_grupo}€ group, ${dr.budget.presupuesto.dentro_presupuesto ? "within target" : "above target"} (${seg.budget}€/person target).`,
    );
  });

  return out.join("\n");
}

/**
 * Compact label for trip badges in the UI: "Lisboa + Porto" for a multi-leg
 * trip, "Roma" for a single one. Truncates if there's a parade of cities.
 */
export function tripDisplayLabel(destinations: DestinationSegment[]): string {
  const names = destinations.map((d) => d.destination).filter(Boolean);
  if (names.length === 0) return "Trip";
  if (names.length <= 3) return names.join(" + ");
  return `${names.slice(0, 2).join(" + ")} + ${names.length - 2} more`;
}
