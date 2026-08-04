import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../src/server/claude/jsonParser";

describe("extractJsonObject", () => {
  it("strips fenced code blocks", () => {
    const raw = '```json\n{"a":1}\n```';
    expect(JSON.parse(extractJsonObject(raw))).toEqual({ a: 1 });
  });

  it("removes trailing commas inside objects and arrays", () => {
    const raw = '{"items":[1,2,3,],"meta":{"k":"v",}}';
    expect(JSON.parse(extractJsonObject(raw))).toEqual({
      items: [1, 2, 3],
      meta: { k: "v" },
    });
  });

  it("closes missing brackets when truncated", () => {
    const raw = '{"items":[1,2,3';
    const out = extractJsonObject(raw);
    expect(JSON.parse(out)).toEqual({ items: [1, 2, 3] });
  });

  it("ignores leading/trailing prose", () => {
    const raw = 'Here you go:\n{"a":"b"}\nThanks';
    expect(JSON.parse(extractJsonObject(raw))).toEqual({ a: "b" });
  });

  it("recovers truncated array of objects, keeping the complete ones", () => {
    const raw = `{
      "itinerario": [
        { "dia": 1, "titulo": "Día A", "actividades": [{"hora":"10:00","nombre":"X"}] },
        { "dia": 2, "titulo": "Día B", "actividades": [{"hora":"11:00","nombre":"Y"}] },
        { "dia": 3, "titulo": "Día C truncado", "actividades": [{"hora":"12:00","nom`;
    const repaired = JSON.parse(extractJsonObject(raw)) as {
      itinerario: Array<{ dia: number; titulo: string }>;
    };
    expect(repaired.itinerario).toHaveLength(2);
    expect(repaired.itinerario.map((d) => d.dia)).toEqual([1, 2]);
  });

  it("recovers truncated activity inside last day", () => {
    const raw = `{
      "itinerario": [
        { "dia": 1, "titulo": "A", "actividades": [
          {"hora":"10:00","nombre":"Uno","tipo":"cultura","descripcion":"ok","coste_persona":0},
          {"hora":"12:00","nombre":"Dos truncado","tipo":"comi`;
    const out = JSON.parse(extractJsonObject(raw)) as {
      itinerario: Array<{ actividades: unknown[] }>;
    };
    expect(out.itinerario[0]?.actividades.length ?? 0).toBeGreaterThanOrEqual(
      1,
    );
  });
});
