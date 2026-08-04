import { z } from "zod";

export const ACTIVITY_TYPES = [
  "cultura",
  "comida",
  "naturaleza",
  "ocio",
  "transporte",
] as const;

export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

// The prompt pins `tipo` to the Spanish enum, but it also tells the model to
// fill the whole JSON in the user's language — so models routinely translate
// this field too. Anything unmapped falls back to "ocio", which then trips the
// "at least one cultura per day" rule in validators.ts. Hence the coverage
// across all six supported locales.
const ACTIVITY_TYPE_ALIASES: Record<string, ActivityType> = {
  gastronomia: "comida",
  food: "comida",
  comer: "comida",
  restaurante: "comida",
  restaurant: "comida",
  cena: "comida",
  almuerzo: "comida",
  desayuno: "comida",
  lunch: "comida",
  dinner: "comida",
  breakfast: "comida",
  meal: "comida",
  dining: "comida",
  repas: "comida",
  restauration: "comida",
  essen: "comida",
  gastronomie: "comida",
  cibo: "comida",
  ristorante: "comida",
  pranzo: "comida",
  refeicao: "comida",

  cultural: "cultura",
  culture: "cultura",
  museo: "cultura",
  museos: "cultura",
  museum: "cultura",
  musee: "cultura",
  historia: "cultura",
  history: "cultura",
  histoire: "cultura",
  geschichte: "cultura",
  storia: "cultura",
  arte: "cultura",
  art: "cultura",
  kunst: "cultura",
  arquitectura: "cultura",
  architecture: "cultura",
  architektur: "cultura",
  kultur: "cultura",
  monumento: "cultura",
  monument: "cultura",

  natural: "naturaleza",
  nature: "naturaleza",
  natur: "naturaleza",
  natura: "naturaleza",
  parque: "naturaleza",
  park: "naturaleza",
  parc: "naturaleza",
  parco: "naturaleza",
  jardin: "naturaleza",
  garden: "naturaleza",
  giardino: "naturaleza",
  playa: "naturaleza",
  beach: "naturaleza",
  plage: "naturaleza",
  strand: "naturaleza",
  spiaggia: "naturaleza",
  praia: "naturaleza",
  montana: "naturaleza",
  mountain: "naturaleza",
  ruta: "naturaleza",
  outdoor: "naturaleza",
  mirador: "naturaleza",
  viewpoint: "naturaleza",

  leisure: "ocio",
  entretenimiento: "ocio",
  entertainment: "ocio",
  loisir: "ocio",
  freizeit: "ocio",
  svago: "ocio",
  lazer: "ocio",
  compras: "ocio",
  shopping: "ocio",
  vida_nocturna: "ocio",
  "vida nocturna": "ocio",
  nightlife: "ocio",
  fiesta: "ocio",
  spa: "ocio",
  relax: "ocio",

  transport: "transporte",
  traslado: "transporte",
  transfer: "transporte",
  vuelo: "transporte",
  flight: "transporte",
  tren: "transporte",
  train: "transporte",
  taxi: "transporte",
  trasporto: "transporte",
  transporto: "transporte",
};

const NormalizedActivityType = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  const normalized = val
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if ((ACTIVITY_TYPES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return ACTIVITY_TYPE_ALIASES[normalized] ?? "ocio";
}, ActivityTypeSchema);

const optionalString = z
  .string()
  .nullable()
  .optional()
  .default("")
  .transform((s) => s?.trim() ?? "");

export const SLOTS = ["manana", "almuerzo", "tarde", "cena"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  manana: "Mañana",
  almuerzo: "Almuerzo",
  tarde: "Tarde",
  cena: "Cena",
};

function normalizeHora(raw: string | undefined): string {
  if (!raw) return "";
  const m = String(raw)
    .trim()
    .match(/^(\d{1,2})\s*[:.h]?\s*(\d{0,2})/);
  if (!m) return "";
  const h = parseInt(m[1] ?? "", 10);
  const min = parseInt(m[2] || "0", 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return "";
  if (Number.isNaN(min) || min < 0 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function bucketFromHora(hora: string): Slot {
  const h = parseInt(hora.split(":")[0] ?? "0", 10);
  if (h < 12) return "manana";
  if (h < 16) return "almuerzo";
  if (h < 20) return "tarde";
  return "cena";
}

const BloqueSchema = z.preprocess((val) => {
  if (typeof val !== "string") return undefined;
  const k = val.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if ((SLOTS as readonly string[]).includes(k)) return k;
  if (k.startsWith("manana") || k.startsWith("morning")) return "manana";
  if (k.startsWith("almuerzo") || k.startsWith("comida") || k === "lunch") return "almuerzo";
  if (k.startsWith("tarde") || k === "afternoon") return "tarde";
  if (k.startsWith("cena") || k === "dinner" || k.startsWith("noche")) return "cena";
  return undefined;
}, z.enum(SLOTS).optional());

// Numbers that the model sometimes returns as null instead of omitting.
const optionalNumber = z
  .number()
  .nonnegative()
  .nullable()
  .optional()
  .transform((n) => n ?? 0);
const optionalIntNumber = z
  .number()
  .int()
  .nonnegative()
  .nullable()
  .optional()
  .transform((n) => n ?? 0);

export const ActivitySchema = z
  .object({
    hora: z.string(),
    bloque: BloqueSchema,
    duracion_min: optionalIntNumber,
    nombre: z.string(),
    tipo: NormalizedActivityType,
    descripcion: optionalString,
    direccion: optionalString,
    barrio: optionalString,
    transporte: optionalString,
    reserva: optionalString,
    web: optionalString,
    alternativa_lluvia: optionalString,
    coste_persona: optionalNumber,
    tip: optionalString,
    /** Filled server-side after the agent returns, looking up the place
     *  in the search cache by name. Optional because old trips and any
     *  activity whose name didn't match a search result won't have one. */
    lat: z.number().optional(),
    lon: z.number().optional(),
  })
  .transform((a) => {
    const hora = normalizeHora(a.hora) || "12:00";
    const bloque = a.bloque ?? bucketFromHora(hora);
    return { ...a, hora, bloque };
  });
export type Activity = z.infer<typeof ActivitySchema>;

export const ItineraryDaySchema = z
  .object({
    dia: z.number().int().positive(),
    titulo: z.string().default(""),
    zona: z.string().default(""),
    resumen: optionalString,
    actividades: z.array(ActivitySchema).default([]),
  })
  .transform((d) => {
    const actividades = [...d.actividades].sort((a, b) => a.hora.localeCompare(b.hora));
    const titulo = d.titulo.trim() || `Día ${d.dia}`;
    return { dia: d.dia, titulo, zona: d.zona, resumen: d.resumen, actividades };
  });
export type ItineraryDay = z.infer<typeof ItineraryDaySchema>;

export const ItinerarySchema = z
  .object({
    itinerario: z.array(ItineraryDaySchema),
  })
  .transform((raw) => ({
    itinerario: raw.itinerario.filter((d) => d.actividades.length > 0),
  }));
export type Itinerary = z.infer<typeof ItinerarySchema>;
