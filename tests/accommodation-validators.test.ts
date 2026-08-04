import { describe, expect, it } from "vitest";
import { findAccommodationIssues } from "../src/server/agents/validators";
import { AccommodationSchema, type Accommodation } from "@/domain/accommodation";

function makeAccommodation(
  opciones: Array<{ tipo: string; nombre_ejemplo: string; zona?: string }>,
): Accommodation {
  return AccommodationSchema.parse({
    opciones: opciones.map((o) => ({
      tipo: o.tipo,
      nombre_ejemplo: o.nombre_ejemplo,
      zona: o.zona ?? "",
      pros: [],
      contras: [],
    })),
  });
}

const KNOWN = new Set<string>([
  "hotel ritz",
  "apartamentos sol",
  "the hat madrid",
]);

describe("findAccommodationIssues", () => {
  it("returns no issues when all 3 names are in search results", () => {
    const acc = makeAccommodation([
      { tipo: "Central hotel", nombre_ejemplo: "Hotel Ritz" },
      { tipo: "Group apartment", nombre_ejemplo: "Apartamentos Sol" },
      { tipo: "Hostel", nombre_ejemplo: "The Hat Madrid" },
    ]);
    expect(findAccommodationIssues(acc, KNOWN)).toEqual([]);
  });

  it("flags wrong number of options", () => {
    const acc = makeAccommodation([
      { tipo: "Central hotel", nombre_ejemplo: "Hotel Ritz" },
      { tipo: "Hostel", nombre_ejemplo: "The Hat Madrid" },
    ]);
    const issues = findAccommodationIssues(acc, KNOWN);
    expect(issues.some((i) => i.includes("EXACTLY 3"))).toBe(true);
  });

  it("flags fabricated names", () => {
    const acc = makeAccommodation([
      { tipo: "Central hotel", nombre_ejemplo: "Imaginary Hotel" },
      { tipo: "Group apartment", nombre_ejemplo: "Apartamentos Sol" },
      { tipo: "Hostel", nombre_ejemplo: "The Hat Madrid" },
    ]);
    const issues = findAccommodationIssues(acc, KNOWN);
    expect(
      issues.some((i) => i.includes("Imaginary Hotel") && i.includes("does NOT appear")),
    ).toBe(true);
  });

  it("flags duplicate options (same place under two archetypes)", () => {
    const acc = makeAccommodation([
      { tipo: "Central hotel", nombre_ejemplo: "Hotel Ritz" },
      { tipo: "Group apartment", nombre_ejemplo: "Hotel Ritz" },
      { tipo: "Hostel", nombre_ejemplo: "The Hat Madrid" },
    ]);
    const issues = findAccommodationIssues(acc, KNOWN);
    expect(
      issues.some((i) => i.toLowerCase().includes("each option must be a different")),
    ).toBe(true);
  });

  it("accepts partial name matches", () => {
    const known = new Set<string>(["hotel barcelo torre madrid"]);
    const acc = makeAccommodation([
      { tipo: "Central hotel", nombre_ejemplo: "Hotel Barcelo" }, // partial of the known name
      { tipo: "Group apartment", nombre_ejemplo: "Hotel Barcelo" },
      { tipo: "Hostel", nombre_ejemplo: "Hotel Barcelo" },
    ]);
    // Names match (partial), but duplicates rule still fires.
    const issues = findAccommodationIssues(acc, known);
    expect(issues.some((i) => i.includes("does NOT appear"))).toBe(false);
  });
});
