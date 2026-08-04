// Live LLM integration. Skipped by default to keep `npm test` fast and
// hermetic. Run on demand with:
//   RUN_LIVE=1 npx vitest run tests/itinerary-agent.live.test.ts
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";

const SKIP = process.env.RUN_LIVE !== "1";

// Load .env.local manually so we don't need a vitest env plugin.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m?.[1] && m[2] !== undefined) process.env[m[1]] = m[2];
}

const { runItineraryAgent } = await import("../src/server/agents/itinerary");
const { defaultLlmConfig } = await import("../src/server/llm/config");

// 1-day trip with accommodation on, so a single test run exercises BOTH
// per-destination agents (itinerary + accommodation) with the OSM tool.
// Local Qwen 9B is slow per turn — expect ~10-15 min to finish.
const trip = {
  destination: "Lisboa",
  startDate: "2026-06-15",
  endDate: "2026-06-15",
  budget: 600,
  includeAccommodation: true,
};

const members = [
  {
    id: "1",
    name: "Aitor",
    interests: ["Gastronomía", "Museos"],
    food: "Sin restricciones" as const,
    pace: "Moderado (4-5 actividades/día)" as const,
    notes: "",
  },
];

const consensus = {
  consenso: {
    ritmo_ideal: "Moderado",
    intereses_comunes: ["Gastronomía", "Museos"],
    restricciones_alimentarias: [],
    conflictos: [],
    recomendacion: "Plan equilibrado",
  },
  perfil_grupo: "Viajero individual",
};

describe.skipIf(SKIP)("itinerary agent (live LLM)", () => {
  it("uses search_places and produces an itinerary with real addresses", async () => {
    let toolCallCount = 0;
    const start = Date.now();

    const result = await runItineraryAgent(trip, members, consensus, defaultLlmConfig(), undefined, {
      onToolCall: (name, input) => {
        toolCallCount++;
        console.log(`  [${toolCallCount}] ${name}(${JSON.stringify(input)})`);
      },
      onToolResult: (name, ok) => {
        console.log(`      → ${ok ? "ok" : "error"}`);
      },
    });

    console.log(
      `\n${Math.round((Date.now() - start) / 1000)}s, ${toolCallCount} tool calls, ${result.itinerario.length} days`,
    );
    for (const day of result.itinerario) {
      console.log(`\nDía ${day.dia}: ${day.titulo}`);
      for (const a of day.actividades) {
        console.log(`  ${a.hora} ${a.bloque} — ${a.nombre}`);
        console.log(`         ${a.direccion}${a.barrio ? ` (${a.barrio})` : ""}`);
      }
    }
  }, 900_000); // 15 min — local 9B is slow; cloud models finish in <1 min
});
