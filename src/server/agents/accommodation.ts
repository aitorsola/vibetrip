import "server-only";
import { runAgentLoop } from "../llm/agentLoop";
import type { LlmConfig } from "../llm/config";
import { env } from "../env";
import { searchPlacesTool, type PlaceResult } from "../tools/searchPlaces";
import type { AgentTool } from "../tools/types";
import {
  AccommodationSchema,
  type Accommodation,
} from "@/domain/accommodation";
import type { Consensus } from "@/domain/consensus";
import { nightsBetween, type DestinationSegment, type Member } from "@/domain/trip";
import { findAccommodationIssues, normalizeName } from "./validators";
import { localeLanguageName, type AgentCallbacks } from "./shared";

const SYSTEM = `You are an accommodation agent. Return EXACTLY 3 real options (hotel, apartment, hostel) using search_places.

RULES:
- 3 searches: search_places("hotel", city), search_places("apartment", city), search_places("hostel", city). If "hostel" returns nothing, try "guest house".
- nombre_ejemplo and zona MUST be copied literally from the search_places result.
- DO NOT invent prices. DO NOT include price fields.
- Pros/cons (max 2 items each): describe the real EXPERIENCE (area, traveler type, atmosphere, distance to center). DO NOT mention prices.

Final JSON (no extra text, no prices):
{
  "opciones": [
    { "tipo": "Central hotel", "nombre_ejemplo": "...", "zona": "...", "pros": ["Good metro connections", "Close to monuments"], "contras": ["Noisy area at night"] },
    { "tipo": "Group apartment", "nombre_ejemplo": "...", "zona": "...", "pros": [...], "contras": [...] },
    { "tipo": "Hostel", "nombre_ejemplo": "...", "zona": "...", "pros": [...], "contras": [...] }
  ]
}`;

function buildPrompt(
  trip: DestinationSegment,
  members: Member[],
  consensus: Consensus,
): string {
  const nights = nightsBetween(trip.startDate, trip.endDate);
  const profile = consensus.perfil_grupo || "mixed group";
  const interests = consensus.consenso.intereses_comunes.join(", ") || "varied";
  const restrictions =
    consensus.consenso.restricciones_alimentarias.join(", ") || "none";
  return `Destination: ${trip.destination}. ${members.length} ${members.length === 1 ? "person" : "people"}. ${nights} ${nights === 1 ? "night" : "nights"}.
Group profile: ${profile}.
Common interests: ${interests}. Restrictions: ${restrictions}.

Types to cover (one of each): central hotel (cultural tourism, couples), apartment (groups, long stays with own kitchen), hostel (low budget or young travelers). Adapt the concrete choice to the destination's profile and area.`;
}

/** Wrap the search tool so we can later check the model used real names. */
function makeRecordingSearchTool(): {
  tool: AgentTool<typeof searchPlacesTool.inputSchema, PlaceResult[]>;
  knownNames: Set<string>;
} {
  const knownNames = new Set<string>();
  const tool: AgentTool<typeof searchPlacesTool.inputSchema, PlaceResult[]> = {
    name: searchPlacesTool.name,
    description: searchPlacesTool.description,
    inputSchema: searchPlacesTool.inputSchema,
    parametersSchema: searchPlacesTool.parametersSchema,
    async execute(input, signal) {
      const results = await searchPlacesTool.execute(input, signal);
      for (const r of results) knownNames.add(normalizeName(r.name));
      return results;
    },
  };
  return { tool, knownNames };
}

function localizedSystem(locale: string): string {
  const lang = localeLanguageName(locale);
  return `IMPORTANT: Reply and fill the ENTIRE JSON (tipo, zona, pros, contras) in ${lang}. Only nombre_ejemplo keeps the original name as returned by search_places.\n\n${SYSTEM}`;
}

export function runAccommodationAgent(
  trip: DestinationSegment,
  members: Member[],
  consensus: Consensus,
  llm: LlmConfig,
  signal?: AbortSignal,
  callbacks?: AgentCallbacks,
  locale: string = "es",
): Promise<Accommodation> {
  const { tool, knownNames } = makeRecordingSearchTool();
  return runAgentLoop({
    llm,
    system: localizedSystem(locale),
    prompt: buildPrompt(trip, members, consensus),
    tools: [tool],
    schema: AccommodationSchema,
    signal,
    agentName: "accommodation",
    maxTokens: env.accommodationMaxTokens,
    maxIterations: 5,
    maxToolCalls: 3,
    onToolCall: callbacks?.onToolCall,
    onToolResult: callbacks?.onToolResult,
    validate: (acc) => findAccommodationIssues(acc, knownNames),
  });
}
