import { describe, expect, it } from "vitest";
import { findItineraryIssues } from "../src/server/agents/validators";
import { ItinerarySchema, type Itinerary } from "@/domain/itinerary";

function makeItinerary(
  days: Array<{
    dia: number;
    actividades: Array<{
      hora: string;
      nombre: string;
      tipo: "cultura" | "comida" | "naturaleza" | "ocio" | "transporte";
    }>;
  }>,
): Itinerary {
  // Run through the schema so we get the same shape the agent produces.
  return ItinerarySchema.parse({
    itinerario: days.map((d) => ({
      dia: d.dia,
      titulo: `Día ${d.dia}`,
      zona: "",
      resumen: "",
      actividades: d.actividades.map((a) => ({
        hora: a.hora,
        nombre: a.nombre,
        tipo: a.tipo,
        descripcion: "",
        direccion: "",
        barrio: "",
        transporte: "",
        reserva: "",
        web: "",
        alternativa_lluvia: "",
        coste_persona: 0,
        duracion_min: 60,
        tip: "",
      })),
    })),
  });
}

const KNOWN = new Set<string>([
  "museo del prado",
  "plaza mayor",
  "retiro",
  "mercado de san miguel",
  "taberna la concha",
  "casa botin",
  "el sobrino de botin",
]);

// A complete, well-formed day used as a baseline so individual tests can mutate
// just the slice they care about without tripping every other rule.
const baselineDay = {
  dia: 1,
  actividades: [
    { hora: "10:00", nombre: "Museo del Prado", tipo: "cultura" as const },
    { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" as const },
    { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" as const },
    { hora: "20:30", nombre: "Casa Botin", tipo: "comida" as const },
  ],
};

describe("findItineraryIssues", () => {
  it("returns no issues for a balanced day", () => {
    const itin = makeItinerary([baselineDay]);
    expect(findItineraryIssues(itin, KNOWN)).toEqual([]);
  });

  it("flags duplicate places across slots", () => {
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "10:00", nombre: "Museo del Prado", tipo: "cultura" },
          { hora: "12:00", nombre: "Museo del Prado", tipo: "cultura" },
          { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" },
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    expect(issues.some((i) => i.includes("Duplicate place"))).toBe(true);
  });

  it("flags fabricated names (not in search results)", () => {
    const itin = makeItinerary([
      {
        ...baselineDay,
        actividades: [
          ...baselineDay.actividades.slice(0, 2),
          { hora: "16:00", nombre: "Inventado Viewpoint", tipo: "naturaleza" },
          baselineDay.actividades[3]!,
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    expect(
      issues.some((i) => i.includes("Inventado Viewpoint") && i.includes("does NOT appear")),
    ).toBe(true);
  });

  it("accepts partial name matches (model shortened the name)", () => {
    const known = new Set([
      "museu nacional de arte antiguo",
      "taberna la concha",
      "retiro",
      "casa botin",
    ]);
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "10:00", nombre: "Museu Nacional", tipo: "cultura" }, // shortened
          { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" },
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    expect(findItineraryIssues(itin, known)).toEqual([]);
  });

  it("flags days without a culture activity", () => {
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" },
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    expect(issues.some((i) => i.includes("no CULTURE activity"))).toBe(true);
  });

  it("flags days without nature/leisure", () => {
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "10:00", nombre: "Museo del Prado", tipo: "cultura" },
          { hora: "12:00", nombre: "Plaza Mayor", tipo: "cultura" },
          { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    expect(issues.some((i) => i.includes("no NATURE or outdoor LEISURE"))).toBe(true);
  });

  it("flags more than 2 food activities in a day", () => {
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "10:00", nombre: "Museo del Prado", tipo: "cultura" },
          { hora: "11:30", nombre: "Mercado de San Miguel", tipo: "comida" },
          { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" },
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    expect(issues.some((i) => i.includes("3 \"comida\" activities"))).toBe(true);
  });

  it("flags the same restaurant used in two meal slots", () => {
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "10:00", nombre: "Museo del Prado", tipo: "cultura" },
          { hora: "13:30", nombre: "Casa Botin", tipo: "comida" },
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    // The duplicate-place rule fires too (same name twice). What we care about
    // is that the restaurant-variety rule fires.
    expect(issues.some((i) => i.toLowerCase().includes("repeat a restaurant"))).toBe(true);
  });

  it("flags the same restaurant repeated across different days", () => {
    const itin = makeItinerary([
      {
        ...baselineDay,
        dia: 1,
      },
      {
        dia: 2,
        actividades: [
          { hora: "10:00", nombre: "Plaza Mayor", tipo: "cultura" },
          { hora: "13:30", nombre: "Casa Botin", tipo: "comida" }, // already used D1.cena
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Mercado de San Miguel", tipo: "comida" },
        ],
      },
    ]);
    const issues = findItineraryIssues(itin, KNOWN);
    expect(
      issues.some(
        (i) => i.toLowerCase().includes("repeat a restaurant") && i.includes("casa botin"),
      ),
    ).toBe(true);
  });

  it("ignores accents and case when comparing names", () => {
    const known = new Set<string>(["sagrada familia"]);
    const itin = makeItinerary([
      {
        dia: 1,
        actividades: [
          { hora: "10:00", nombre: "SAGRADA FAMÍLIA", tipo: "cultura" },
          { hora: "13:30", nombre: "Taberna La Concha", tipo: "comida" },
          { hora: "16:00", nombre: "Retiro", tipo: "naturaleza" },
          { hora: "20:30", nombre: "Casa Botin", tipo: "comida" },
        ],
      },
    ]);
    // Restaurant names not in `known` will trip the fabricated-name check;
    // we only assert the accented/uppercase one passes.
    const issues = findItineraryIssues(itin, known);
    expect(issues.some((i) => i.includes("SAGRADA FAMÍLIA"))).toBe(false);
  });
});
