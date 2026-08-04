// Live LLM integration. Skipped by default. Run with:
//   RUN_LIVE=1 npx vitest run tests/accommodation-agent.live.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SKIP = process.env.RUN_LIVE !== "1";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m?.[1] && m[2] !== undefined) process.env[m[1]] = m[2];
}

const { runAccommodationAgent } = await import(
  "../src/server/agents/accommodation"
);
const { defaultLlmConfig } = await import("../src/server/llm/config");

const trip = {
  destination: "Lisboa",
  startDate: "2026-06-15",
  endDate: "2026-06-17",
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
  {
    id: "2",
    name: "Marta",
    interests: ["Arte"],
    food: "Vegetariano" as const,
    pace: "Tranquilo (2-3 actividades/día)" as const,
    notes: "",
  },
];

const consensus = {
  consenso: {
    ritmo_ideal: "Moderado",
    intereses_comunes: ["Gastronomía", "Museos"],
    restricciones_alimentarias: ["Vegetariano"],
    conflictos: [],
    recomendacion: "Plan equilibrado en zona céntrica",
  },
  perfil_grupo: "Pareja con intereses culturales",
};

describe.skipIf(SKIP)("accommodation agent (live LLM)", () => {
  it("returns 3 real hotels/apartments/hostels from OSM", async () => {
    let count = 0;
    const start = Date.now();

    const result = await runAccommodationAgent(
      trip,
      members,
      consensus,
      defaultLlmConfig(),
      undefined,
      {
        onToolCall: (name, input) => {
          count++;
          console.log(`  [${count}] ${name}(${JSON.stringify(input)})`);
        },
        onToolResult: (_name, ok) => console.log(`      → ${ok ? "ok" : "error"}`),
      },
    );

    const sec = Math.round((Date.now() - start) / 1000);
    console.log(`\n${sec}s, ${count} tool calls, ${result.opciones.length} options`);
    for (const op of result.opciones) {
      console.log(`\n[${op.tipo}] ${op.nombre_ejemplo}`);
      console.log(`  zona: ${op.zona}`);
      console.log(`  pros: ${op.pros.join(" / ")}`);
      console.log(`  contras: ${op.contras.join(" / ")}`);
    }

    // Sanity assertions: 3 distinct options, each with a non-empty name.
    expect(result.opciones).toHaveLength(3);
    const names = new Set(result.opciones.map((o) => o.nombre_ejemplo));
    expect(names.size).toBe(3);
    for (const op of result.opciones) {
      expect(op.nombre_ejemplo.trim().length).toBeGreaterThan(0);
      expect(op.nombre_ejemplo).not.toMatch(/inventado/i);
    }
  }, 720_000); // 12 min
});
