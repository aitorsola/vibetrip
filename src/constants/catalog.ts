import type { FoodPreference, Pace } from "@/domain/trip";

export const DESTINATION_SUGGESTIONS = [
  "Lisboa",
  "Roma",
  "París",
  "Ámsterdam",
  "Praga",
  "Marrakech",
  "Estambul",
  "Atenas",
  "Londres",
  "Edimburgo",
  "Oporto",
  "Dubrovnik",
  "Budapest",
  "Viena",
  "Berlín",
] as const;

export const INTERESTS = [
  "Gastronomía",
  "Museos",
  "Fiesta",
  "Naturaleza",
  "Vida nocturna",
  "Playa",
  "Compras",
  "Arquitectura",
  "Deporte",
  "Relax/spa",
  "Arte callejero",
  "Mercados locales",
  "Rutas a pie",
] as const;

export const FOOD_PREFERENCES: readonly FoodPreference[] = [
  "Sin restricciones",
  "Vegetariano",
  "Vegano",
  "Sin gluten",
  "Halal",
  "Sin lactosa",
];

export const PACE_OPTIONS: readonly Pace[] = [
  "Tranquilo (2-3 actividades/día)",
  "Moderado (4-5 actividades/día)",
  "Intenso (6+ actividades/día)",
];
