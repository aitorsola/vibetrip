import "server-only";
import { runAgentLoop } from "../llm/agentLoop";
import type { LlmConfig } from "../llm/config";
import { env } from "../env";
import { searchPlacesTool, type PlaceResult } from "../tools/searchPlaces";
import type { AgentTool } from "../tools/types";
import type { Consensus } from "@/domain/consensus";
import { ItinerarySchema, type Itinerary } from "@/domain/itinerary";
import { nightsBetween, type DestinationSegment, type Member } from "@/domain/trip";
import { findItineraryIssues, normalizeName } from "./validators";
import { localeLanguageName, type AgentCallbacks } from "./shared";

const SYSTEM = `You are an expert travel agent who designs dense, well-clustered itineraries focused on the MUST-SEE highlights of each destination. You work in 5 phases.

PHASE 1 — THINK. Before calling search_places, mentally list 10-12 highly representative places of the destination. Cover these categories: iconic squares/gates, palaces or historic buildings, main cathedrals/churches/mosques, top museums, iconic parks, historic or bohemian neighborhoods, viewpoints or rooftops, emblematic markets.
Quality filter: "If a traveler missed X after visiting this destination, X must be on your list." For 1-2 days pick the 4-6 most iconic; for 4+ days cover the whole list. NEVER use generic queries ("monument", "landmark", "museum") — they return junk.

PHASE 2 — SEARCH BY NAME. Call search_places ONCE per must-see with its exact name. For neighborhoods and areas use the neighborhood name.
For food use the term a local would use to talk about their typical cuisine (don't translate: "tapas" or "taberna" in Spain, "izakaya" or "ramen" in Japan, "trattoria" in Italy, "bistrot" in France, etc.). NEVER use "traditional restaurant" — it mixes random international results. Do 2-3 food searches with different queries to get variety.
Expected total: 8-12 searches for places + 2-3 for food.

PHASE 3 — CLUSTER. Look at the addresses returned and group nearby places into the same day. Don't make the group cross the city multiple times. Each day has a theme: contiguous area, logical route.

PHASE 4 — DENSITY PER BLOCK. 6-8 activities/day (including the 2 meals). Each block fits 2-3 activities, don't leave 2 dead hours. Reference template:

  Morning (5h):                         Afternoon (4h):
   09:30 breakfast (30 min)              16:00 main monument (90 min)
   10:15 main monument (120 min)         17:45 viewpoint or square (40 min)
   12:30 walk / market (40 min)          18:45 walk or minor attraction (45 min)
   13:30 → lunch                          20:30 → dinner

Ideal day composition: 1-2 cultural (monument/museum/palace), 1-2 walks/neighborhoods/squares/viewpoints in between, lunch + dinner, 1 optional activity based on group preferences.

PHASE 5 — REVIEW. Before closing the JSON: did any universally known icon of the destination get left out? If so, search again and add an activity — sacrifice detail on lesser ones if needed.

HARD RULES (non-negotiable):
- Every day MUST have ≥1 culture + ≥1 nature/leisure (viewpoint/park/market/walk). Group inclinations (food, nightlife, nature) MODULATE the selection, they do NOT exclude the destination's icons.
- Lunch and dinner already cover food: FORBIDDEN to add a third meal or a bar as a morning/afternoon activity just because the group likes eating.
- FORBIDDEN to repeat the same restaurant in different slots or different days. Each meal is a different place.
- If an activity is NOT LOCAL cuisine of the destination (e.g. American restaurant in Madrid), do NOT include it — find another.

EACH ACTIVITY (concise, max ~15 words per text field):
- "descripcion": what to do there, what stands out.
- "tip": non-obvious advice.
- "transporte": metro/line, "10 min walk", "8€ taxi". Empty for the 1st of the day.
- "alternativa_lluvia": ONLY for OUTDOOR activities (viewpoint, park, walk, terrace, coast, street market). If the activity is already indoors (museum, palace, church, restaurant, covered market), leave "" empty.
- "coste_persona": entry or average meal cost in €. 0 if free.
- "duracion_min": realistic (monument/museum 90-150, meal 75, park 60-90, viewpoint 45, market 60, cafe 30).
- "nombre" and "direccion": COPY LITERALLY from the search_places result. Don't invent.
- "tipo": cultura | comida | naturaleza | ocio | transporte. lunch and dinner are ALWAYS "comida".
- Non-applicable fields: "" or 0. NEVER null.

DAY: "titulo" (theme), "zona" (main neighborhood), "resumen" (1 sentence with the narrative arc).

REALISTIC times, vary day by day. Lunch: Spain/Portugal/Italy 13:30-14:30; France/UK/Germany 12:00-13:00; Asia 12:00. Dinner: Spain/Portugal 20:30-21:30; Italy 20:00-21:00; France 19:30-20:30; UK/Germany/USA 18:30-19:30; Asia 18:00-19:00. Museums open 09:00-10:00 and close 17:30-19:00. Viewpoints ~1h before sunset.

Final JSON (no backticks, no extra text). Each activity complete with ALL its fields as in this example:
{
  "itinerario": [
    {
      "dia": 1,
      "titulo": "Historic center",
      "zona": "Center",
      "resumen": "Morning of monuments in the old quarter, lunch in the historic district, sunset from a viewpoint.",
      "actividades": [
        {
          "bloque": "manana", "hora": "10:00", "duracion_min": 120,
          "nombre": "<exact name from search_places>", "tipo": "cultura",
          "descripcion": "Tour the palace and visit the royal halls.",
          "direccion": "<exact address from search_places>",
          "barrio": "<neighborhood>", "transporte": "",
          "reserva": "", "web": "", "alternativa_lluvia": "",
          "coste_persona": 14, "tip": "Buy ticket online to skip the queue."
        }
      ]
    }
  ]
}
Repeat the pattern for every activity on every requested day.`;

function buildPrompt(
  trip: DestinationSegment,
  members: Member[],
  consensus: Consensus,
): string {
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const days = nights + 1;
  const groupSize =
    members.length === 1 ? "1 person (solo trip)" : `${members.length} people`;

  const memberSummary = members
    .map(
      (m) =>
        `- ${m.name}: ${m.interests.join(", ")} | food: ${m.food} | pace: ${m.pace}${m.notes ? ` | note: "${m.notes}"` : ""}`,
    )
    .join("\n");

  const target = days * 7;
  const interestsList = consensus.consenso.intereses_comunes.join(", ") || "varied";

  return `Itinerary for ${trip.destination}, ${trip.startDate} → ${trip.endDate} (${days} days). Group: ${groupSize}.
Pace: ${consensus.consenso.ritmo_ideal}.
Group inclination: ${interestsList} (inclines, doesn't exclude).
Dietary restrictions: ${consensus.consenso.restricciones_alimentarias.join(", ") || "none"}.

Travelers:
${memberSummary}

Goal: ${days} days with 6-8 activities each (≈${target} total).`;
}

/**
 * Wraps the search tool to record every place it has returned, so we can
 * later (a) check that the model used real names instead of paraphrasing,
 * and (b) enrich each activity with lat/lon for the map view.
 */
function makeRecordingSearchTool(): {
  tool: AgentTool<typeof searchPlacesTool.inputSchema, PlaceResult[]>;
  knownNames: Set<string>;
  knownPlaces: Map<string, PlaceResult>;
} {
  const knownNames = new Set<string>();
  const knownPlaces = new Map<string, PlaceResult>();
  const tool: AgentTool<typeof searchPlacesTool.inputSchema, PlaceResult[]> = {
    name: searchPlacesTool.name,
    description: searchPlacesTool.description,
    inputSchema: searchPlacesTool.inputSchema,
    parametersSchema: searchPlacesTool.parametersSchema,
    async execute(input, signal) {
      const results = await searchPlacesTool.execute(input, signal);
      for (const r of results) {
        const key = normalizeName(r.name);
        knownNames.add(key);
        if (!knownPlaces.has(key)) knownPlaces.set(key, r);
      }
      return results;
    },
  };
  return { tool, knownNames, knownPlaces };
}

function findPlaceForActivityName(
  name: string,
  knownPlaces: Map<string, PlaceResult>,
): PlaceResult | null {
  const key = normalizeName(name);
  if (!key) return null;
  const exact = knownPlaces.get(key);
  if (exact) return exact;
  // Partial match: the model often shortens names (eg "Museu Nacional" vs
  // "Museu Nacional de Arte Antiguo"). Pick the first hit, good enough for
  // a map pin.
  for (const [k, v] of knownPlaces) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

function enrichWithCoords(
  itin: Itinerary,
  knownPlaces: Map<string, PlaceResult>,
): Itinerary {
  let total = 0;
  let matched = 0;
  const enriched = {
    itinerario: itin.itinerario.map((day) => ({
      ...day,
      actividades: day.actividades.map((a) => {
        total++;
        if (a.lat !== undefined && a.lon !== undefined) {
          matched++;
          return a;
        }
        const place = findPlaceForActivityName(a.nombre, knownPlaces);
        if (place) {
          matched++;
          return { ...a, lat: place.lat, lon: place.lon };
        }
        return a;
      }),
    })),
  };
  console.log(
    `[itinerary] enriched ${matched}/${total} activities with coords (cache: ${knownPlaces.size} places)`,
  );
  return enriched;
}

// OSM "category/type" tokens that unambiguously indicate the activity is
// indoors. If matched, alternativa_lluvia is stripped — a museum doesn't need
// a "what to do if it rains" plan. Anything not on this list defaults to
// outdoor (we'd rather show a useless rain plan than miss one for an actual
// outdoor activity).
const INDOOR_OSM_TYPES = new Set<string>([
  "museum",
  "gallery",
  "aquarium",
  "place_of_worship",
  "theatre",
  "cinema",
  "library",
  "casino",
  "spa",
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "food_court",
  "biergarten", // half-and-half but covered seating is the norm
  "nightclub",
  "fitness_centre",
  "sports_centre",
]);

// Fallback regex for activities whose name didn't match any search_places
// result, so we have no OSM category to consult. Multilingual on purpose:
// the model writes the name in the user's locale, not in English.
const INDOOR_NAME_FALLBACK =
  /museo|museum|musée|palacio|palace|palazzo|catedral|cathedral|iglesia|church|chiesa|basílica|basilica|monasterio|monastery|teatro|theater|théâtre|opera|cine|cinema|biblioteca|library|gallery|galería|galeria|spa|hammam/i;

function isIndoor(
  activityName: string,
  description: string,
  osmCategory: string | undefined,
): boolean {
  if (osmCategory) {
    const type = osmCategory.split("/")[1] ?? "";
    return INDOOR_OSM_TYPES.has(type);
  }
  return INDOOR_NAME_FALLBACK.test(`${activityName} ${description}`);
}

function stripPointlessRainAlternatives(
  itin: Itinerary,
  knownPlaces: Map<string, PlaceResult>,
): Itinerary {
  return {
    itinerario: itin.itinerario.map((day) => ({
      ...day,
      actividades: day.actividades.map((a) => {
        if (!a.alternativa_lluvia) return a;
        const isMeal = a.tipo === "comida";
        const place = findPlaceForActivityName(a.nombre, knownPlaces);
        if (isMeal || isIndoor(a.nombre, a.descripcion, place?.category)) {
          return { ...a, alternativa_lluvia: "" };
        }
        return a;
      }),
    })),
  };
}

function localizedSystem(locale: string): string {
  const lang = localeLanguageName(locale);
  // Inject the language requirement at the top so every model honors it from
  // the very first turn, ignoring whatever language the example texts use.
  return `IMPORTANT: Reply and fill the ENTIRE JSON (titles, descriptions, tips, transport, rain alternatives, etc.) in ${lang}. search_places queries can be made in any local language of the destination.\n\n${SYSTEM}`;
}

export async function runItineraryAgent(
  trip: DestinationSegment,
  members: Member[],
  consensus: Consensus,
  llm: LlmConfig,
  signal?: AbortSignal,
  callbacks?: AgentCallbacks,
  locale: string = "es",
): Promise<Itinerary> {
  const { tool: searchTool, knownNames, knownPlaces } = makeRecordingSearchTool();
  const itinerary = await runAgentLoop({
    llm,
    system: localizedSystem(locale),
    prompt: buildPrompt(trip, members, consensus),
    tools: [searchTool],
    schema: ItinerarySchema,
    signal,
    agentName: "itinerary",
    maxTokens: env.itineraryMaxTokens,
    // 8-12 searches per must-see + 2-3 food + final = ~14
    maxIterations: 16,
    maxToolCalls: 14,
    onToolCall: callbacks?.onToolCall,
    onToolResult: callbacks?.onToolResult,
    validate: (itin) => findItineraryIssues(itin, knownNames),
  });
  return stripPointlessRainAlternatives(
    enrichWithCoords(itinerary, knownPlaces),
    knownPlaces,
  );
}
