import type { DestinationSegment, Member } from "@/domain/trip";
import { uuid } from "@/lib/uuid";

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface SamplePreset {
  destinations: DestinationSegment[];
  members: Omit<Member, "id">[];
}

// Every preset spans 2 days per destination. Samples exist to demo the
// planner in one click, and anything longer than MAX_DEFAULT_MODEL_DAYS
// would greet non-BYOK users with the day-limit warning instead.

const PRESETS: SamplePreset[] = [
  {
    destinations: [
      {
        destination: "Lisboa",
        startDate: isoDateOffset(30),
        endDate: isoDateOffset(31),
        budget: 300,
        includeAccommodation: true,
      },
    ],
    members: [
      {
        name: "Aitor",
        interests: ["Gastronomía", "Arte callejero", "Mercados locales"],
        food: "Sin restricciones",
        pace: "Moderado (4-5 actividades/día)",
        notes: "Quiero probar pastéis de nata en Belém sí o sí.",
      },
      {
        name: "Marta",
        interests: ["Museos", "Arquitectura", "Compras"],
        food: "Vegetariano",
        pace: "Tranquilo (2-3 actividades/día)",
        notes: "Odio madrugar, antes de las 10 nada.",
      },
      {
        name: "Diego",
        interests: ["Vida nocturna", "Gastronomía", "Rutas a pie"],
        food: "Sin restricciones",
        pace: "Intenso (6+ actividades/día)",
        notes: "Quiero salir de fiesta al menos una noche.",
      },
    ],
  },
  {
    destinations: [
      {
        destination: "Roma",
        startDate: isoDateOffset(45),
        endDate: isoDateOffset(46),
        budget: 400,
        includeAccommodation: true,
      },
    ],
    members: [
      {
        name: "Lucía",
        interests: ["Museos", "Arquitectura", "Gastronomía"],
        food: "Sin gluten",
        pace: "Moderado (4-5 actividades/día)",
        notes: "Coliseo y Vaticano son obligatorios.",
      },
      {
        name: "Pablo",
        interests: ["Gastronomía", "Mercados locales", "Vida nocturna"],
        food: "Sin restricciones",
        pace: "Moderado (4-5 actividades/día)",
        notes: "Quiero comer pasta cacio e pepe en Trastevere.",
      },
    ],
  },
  {
    destinations: [
      {
        destination: "Marrakech",
        startDate: isoDateOffset(60),
        endDate: isoDateOffset(61),
        budget: 250,
        includeAccommodation: true,
      },
    ],
    members: [
      {
        name: "Nora",
        interests: ["Mercados locales", "Relax/spa", "Gastronomía"],
        food: "Halal",
        pace: "Tranquilo (2-3 actividades/día)",
        notes: "Prioridad: hammam tradicional.",
      },
      {
        name: "Iván",
        interests: ["Naturaleza", "Rutas a pie", "Arquitectura"],
        food: "Sin restricciones",
        pace: "Intenso (6+ actividades/día)",
        notes: "Excursión al Atlas si da tiempo.",
      },
      {
        name: "Sara",
        interests: ["Compras", "Arte callejero", "Gastronomía"],
        food: "Vegetariano",
        pace: "Moderado (4-5 actividades/día)",
        notes: "",
      },
      {
        name: "Tomás",
        interests: ["Vida nocturna", "Gastronomía"],
        food: "Sin restricciones",
        pace: "Moderado (4-5 actividades/día)",
        notes: "",
      },
    ],
  },
  {
    destinations: [
      {
        destination: "Ámsterdam",
        startDate: isoDateOffset(35),
        endDate: isoDateOffset(36),
        budget: 350,
        includeAccommodation: true,
      },
      {
        destination: "Berlín",
        startDate: isoDateOffset(37),
        endDate: isoDateOffset(38),
        budget: 350,
        includeAccommodation: true,
      },
    ],
    members: [
      {
        name: "Carlos",
        interests: ["Museos", "Arte callejero", "Vida nocturna"],
        food: "Sin restricciones",
        pace: "Moderado (4-5 actividades/día)",
        notes: "El Rijksmuseum en Ámsterdam y Berghain en Berlín.",
      },
      {
        name: "Ana",
        interests: ["Gastronomía", "Mercados locales", "Arquitectura"],
        food: "Vegetariano",
        pace: "Tranquilo (2-3 actividades/día)",
        notes: "Alérgica a los mariscos.",
      },
    ],
  },
];

export function getRandomSample(): { destinations: DestinationSegment[]; members: Member[] } {
  const idx = Math.floor(Math.random() * PRESETS.length);
  const preset = PRESETS[idx] ?? PRESETS[0];
  if (!preset) throw new Error("No sample presets available");
  return {
    destinations: preset.destinations,
    members: preset.members.map((m) => ({ ...m, id: uuid() })),
  };
}
