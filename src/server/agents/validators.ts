import type { Accommodation } from "@/domain/accommodation";
import type { Itinerary } from "@/domain/itinerary";

/**
 * Lower-case, strip diacritics, drop punctuation, collapse whitespace.
 * Used to compare place names returned by search_places against names the
 * model wrote in the final JSON, so "SAGRADA FAMÍLIA" and "Sagrada Familia"
 * count as the same place.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findItineraryIssues(
  itin: Itinerary,
  knownNames: Set<string>,
): string[] {
  const issues: string[] = [];

  // 1) Duplicate places across slots.
  const seen = new Map<string, string>();
  for (const day of itin.itinerario) {
    for (const a of day.actividades) {
      const key = normalizeName(a.nombre);
      if (!key) continue;
      const slot = `D${day.dia}.${a.bloque ?? "?"}`;
      const prev = seen.get(key);
      if (prev) {
        issues.push(
          `Duplicate place "${a.nombre}" appears in ${prev} and in ${slot}. Replace one of them with a different real place.`,
        );
      } else {
        seen.set(key, slot);
      }
    }
  }

  // 2) Names the model wrote that don't match any search_places result
  //    (i.e. fabricated / paraphrased like "Viewpoint" or "Jardim").
  for (const day of itin.itinerario) {
    for (const a of day.actividades) {
      const key = normalizeName(a.nombre);
      if (!key || knownNames.has(key)) continue;
      // Allow partial matches: the model sometimes shortens names, e.g.
      // "Museu Nacional" instead of "Museu Nacional de Arte Antiguo".
      const partial = [...knownNames].some(
        (k) => k.includes(key) || key.includes(k),
      );
      if (partial) continue;
      const slot = `D${day.dia}.${a.bloque ?? "?"}`;
      issues.push(
        `The name "${a.nombre}" in ${slot} does NOT appear in any search_places result. Replace it with one of the REAL places you already found in your previous searches. If none fit, run a new search with a different query and pick a name that appears in the results.`,
      );
    }
  }

  // 3) Balance check: every day must include at least one cultural activity
  //    AND at least one outdoor / discovery activity (naturaleza or ocio).
  //    Prevents "gastro" preferences turning into a 100% food itinerary.
  for (const day of itin.itinerario) {
    const types = day.actividades.map((a) => a.tipo);
    const hasCulture = types.includes("cultura");
    const hasOutdoor = types.includes("naturaleza") || types.includes("ocio");
    if (!hasCulture) {
      issues.push(
        `Day ${day.dia} has no CULTURE activity (monument, museum, historic building, iconic neighborhood). Replace one of the non-essential stops with an emblematic cultural place of the destination, even if the group didn't explicitly ask for it.`,
      );
    }
    if (!hasOutdoor) {
      issues.push(
        `Day ${day.dia} has no NATURE or outdoor LEISURE activity (viewpoint, park, market, neighborhood walk). Add at least one.`,
      );
    }
    const foodCount = types.filter((t) => t === "comida").length;
    if (foodCount > 2) {
      issues.push(
        `Day ${day.dia} has ${foodCount} "comida" activities. Only 2 are allowed (lunch + dinner). Change the extras to culture, nature or leisure.`,
      );
    }
  }

  // 4) Restaurant variety: every meal must be a different restaurant. Detect
  //    same restaurant used for lunch+dinner or repeated across days.
  const mealNames = new Map<string, string[]>();
  for (const day of itin.itinerario) {
    for (const a of day.actividades) {
      if (a.tipo !== "comida") continue;
      const k = normalizeName(a.nombre);
      if (!k) continue;
      const where = `D${day.dia}.${a.bloque}`;
      const list = mealNames.get(k) ?? [];
      list.push(where);
      mealNames.set(k, list);
    }
  }
  for (const [key, slots] of mealNames) {
    if (slots.length > 1) {
      issues.push(
        `Restaurant "${key}" is used in ${slots.join(", ")}. FORBIDDEN to repeat a restaurant. Replace the duplicates with OTHER different restaurants. If you don't have enough in your searches, run a new search with another local cuisine query.`,
      );
    }
  }

  return issues;
}

export function findAccommodationIssues(
  acc: Accommodation,
  knownNames: Set<string>,
): string[] {
  const issues: string[] = [];

  if (acc.opciones.length !== 3) {
    issues.push(
      `You returned ${acc.opciones.length} options, there must be EXACTLY 3 (hotel, apartment, hostel).`,
    );
  }

  for (const op of acc.opciones) {
    const key = normalizeName(op.nombre_ejemplo);
    if (!key) {
      issues.push(`One option has an empty nombre_ejemplo.`);
      continue;
    }
    if (knownNames.has(key)) continue;
    const partial = [...knownNames].some(
      (k) => k.includes(key) || key.includes(k),
    );
    if (partial) continue;
    issues.push(
      `The name "${op.nombre_ejemplo}" (type "${op.tipo}") does NOT appear in any search_places result. Replace it with a real name from your searches. If you have no results of that type, search with another query (e.g. "guest house", "bed and breakfast", "apartments").`,
    );
  }

  // Duplicate detection (model picks the same hotel for two archetypes).
  const seen = new Map<string, string>();
  for (const op of acc.opciones) {
    const key = normalizeName(op.nombre_ejemplo);
    if (!key) continue;
    const prev = seen.get(key);
    if (prev) {
      issues.push(
        `"${op.nombre_ejemplo}" appears as ${prev} and as "${op.tipo}". Each option must be a different accommodation.`,
      );
    } else {
      seen.set(key, op.tipo);
    }
  }

  return issues;
}
