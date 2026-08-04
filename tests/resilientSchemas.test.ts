import { describe, expect, it } from "vitest";
import { AccommodationSchema } from "../src/domain/accommodation";
import { ConsensusSchema } from "../src/domain/consensus";
import { ItinerarySchema } from "../src/domain/itinerary";

// These tests document the LLM-output quirks we deliberately tolerate.
// Each case below has been observed in real responses from local models or
// Groq's small models. A schema regression here means a working trip would
// suddenly fail with a parse error.

describe("ConsensusSchema resilience", () => {
  it("accepts the canonical shape", () => {
    const r = ConsensusSchema.parse({
      consenso: {
        ritmo_ideal: "Moderado",
        intereses_comunes: ["museos"],
        restricciones_alimentarias: [],
        conflictos: [],
        recomendacion: "Plan equilibrado",
      },
      perfil_grupo: "Grupo de 2",
    });
    expect(r.consenso.recomendacion).toBe("Plan equilibrado");
  });

  it("coerces a string consenso into a full object", () => {
    const r = ConsensusSchema.parse({
      consenso: "Plan equilibrado, museos por la mañana",
      perfil_grupo: "Grupo de 2",
    });
    expect(r.consenso.recomendacion).toBe(
      "Plan equilibrado, museos por la mañana",
    );
    expect(r.consenso.intereses_comunes).toEqual([]);
  });

  it("fills missing fields with safe defaults", () => {
    const r = ConsensusSchema.parse({
      consenso: { recomendacion: "Solo recomendación" },
      perfil_grupo: "G",
    });
    expect(r.consenso.ritmo_ideal).toBe("Moderado");
    expect(r.consenso.conflictos).toEqual([]);
  });
});

describe("AccommodationSchema resilience", () => {
  const validOption = {
    tipo: "Hotel",
    nombre_ejemplo: "X",
    zona: "Centro",
    precio_noche_estimado: 80,
    precio_total_grupo: 800,
    pros: ["a"],
    contras: ["b"],
  };

  it("accepts the canonical shape", () => {
    const r = AccommodationSchema.parse({ opciones: [validOption] });
    expect(r.opciones).toHaveLength(1);
  });

  it("parses opciones if returned as a JSON-stringified array", () => {
    const r = AccommodationSchema.parse({
      opciones: JSON.stringify([validOption]),
    });
    expect(r.opciones[0]?.tipo).toBe("Hotel");
  });

  it("unwraps nested { opciones: { opciones: [...] } } returned by some models", () => {
    const r = AccommodationSchema.parse({
      opciones: { opciones: [validOption] },
    });
    expect(r.opciones).toHaveLength(1);
  });

  it("parses pros/contras if returned as JSON strings", () => {
    const r = AccommodationSchema.parse({
      opciones: [
        {
          ...validOption,
          pros: JSON.stringify(["pro1", "pro2"]),
          contras: JSON.stringify(["con1"]),
        },
      ],
    });
    expect(r.opciones[0]?.pros).toEqual(["pro1", "pro2"]);
  });
});

describe("ItinerarySchema resilience", () => {
  const baseActivity = {
    hora: "10:00",
    duracion_min: 90,
    nombre: "Catedral",
    tipo: "cultura",
    descripcion: "Visita guiada",
    direccion: "Plaza Mayor",
    barrio: "Centro",
    transporte: "Metro L1",
    reserva: "",
    web: "",
    alternativa_lluvia: "",
    coste_persona: 9,
    tip: "Llega pronto",
  };

  const fullDay = {
    dia: 1,
    titulo: "Día cultural",
    zona: "Centro",
    resumen: "Mañana cultural",
    actividades: [
      { ...baseActivity, hora: "10:00" },
      { ...baseActivity, hora: "13:30", tipo: "comida" },
      { ...baseActivity, hora: "17:00" },
      { ...baseActivity, hora: "21:00", tipo: "comida" },
    ],
  };

  it("accepts a full day", () => {
    const r = ItinerarySchema.parse({ itinerario: [fullDay] });
    expect(r.itinerario[0]?.actividades).toHaveLength(4);
  });

  it("keeps a day that arrived truncated mid-generation", () => {
    const r = ItinerarySchema.parse({
      itinerario: [
        fullDay,
        {
          dia: 2,
          titulo: "Día 2",
          zona: "Costa",
          resumen: "",
          actividades: [{ ...baseActivity, hora: "10:00" }],
        },
      ],
    });
    expect(r.itinerario).toHaveLength(2);
    expect(r.itinerario[1]?.actividades).toHaveLength(1);
  });

  it("filters out days that carry no activities", () => {
    const r = ItinerarySchema.parse({
      itinerario: [
        fullDay,
        { dia: 2, titulo: "Empty", zona: "z", resumen: "", actividades: [] },
      ],
    });
    expect(r.itinerario).toHaveLength(1);
  });

  it("defaults actividades when the key is missing entirely", () => {
    const r = ItinerarySchema.parse({
      itinerario: [fullDay, { dia: 2, titulo: "Empty", zona: "z", resumen: "" }],
    });
    expect(r.itinerario).toHaveLength(1);
  });

  it("falls back to 'Día N' when the model omits titulo", () => {
    const r = ItinerarySchema.parse({
      itinerario: [{ ...fullDay, titulo: "" }],
    });
    expect(r.itinerario[0]?.titulo).toBe("Día 1");
  });

  it("sorts activities by hora regardless of the order sent", () => {
    const r = ItinerarySchema.parse({
      itinerario: [
        {
          ...fullDay,
          actividades: [
            { ...baseActivity, hora: "21:00" },
            { ...baseActivity, hora: "10:00" },
            { ...baseActivity, hora: "13:30" },
          ],
        },
      ],
    });
    expect(r.itinerario[0]?.actividades.map((a) => a.hora)).toEqual([
      "10:00",
      "13:30",
      "21:00",
    ]);
  });

  it.each([
    ["9.30", "09:30"],
    ["9h30", "09:30"],
    ["09:30", "09:30"],
    ["9", "09:00"],
    ["not a time", "12:00"],
    ["25:00", "12:00"],
  ])("normalizes hora %s → %s", (raw, expected) => {
    const r = ItinerarySchema.parse({
      itinerario: [{ ...fullDay, actividades: [{ ...baseActivity, hora: raw }] }],
    });
    expect(r.itinerario[0]?.actividades[0]?.hora).toBe(expected);
  });

  it.each([
    ["gastronomia", "comida"],
    ["Gastronomía", "comida"],
    ["museo", "cultura"],
    ["museum", "cultura"],
    ["musée", "cultura"],
    ["Kunst", "cultura"],
    ["nightlife", "ocio"],
    ["vida nocturna", "ocio"],
    ["Strand", "naturaleza"],
    ["refeição", "comida"],
    ["something we've never seen", "ocio"],
  ])("normalizes tipo %s → %s", (raw, expected) => {
    const r = ItinerarySchema.parse({
      itinerario: [{ ...fullDay, actividades: [{ ...baseActivity, tipo: raw }] }],
    });
    expect(r.itinerario[0]?.actividades[0]?.tipo).toBe(expected);
  });

  it.each([
    ["08:00", "manana"],
    ["13:00", "almuerzo"],
    ["18:00", "tarde"],
    ["21:00", "cena"],
  ])("derives bloque from hora %s → %s", (hora, expected) => {
    const r = ItinerarySchema.parse({
      itinerario: [{ ...fullDay, actividades: [{ ...baseActivity, hora }] }],
    });
    expect(r.itinerario[0]?.actividades[0]?.bloque).toBe(expected);
  });

  it("prefers an explicit bloque over the one derived from hora", () => {
    const r = ItinerarySchema.parse({
      itinerario: [
        {
          ...fullDay,
          actividades: [{ ...baseActivity, hora: "21:00", bloque: "morning" }],
        },
      ],
    });
    expect(r.itinerario[0]?.actividades[0]?.bloque).toBe("manana");
  });

  it("turns null string fields into empty strings", () => {
    const r = ItinerarySchema.parse({
      itinerario: [
        {
          ...fullDay,
          actividades: [
            {
              ...baseActivity,
              descripcion: null,
              tip: null,
              web: null,
              coste_persona: null,
              duracion_min: null,
            },
          ],
        },
      ],
    });
    const a = r.itinerario[0]?.actividades[0];
    expect(a?.descripcion).toBe("");
    expect(a?.tip).toBe("");
    expect(a?.coste_persona).toBe(0);
    expect(a?.duracion_min).toBe(0);
  });
});
