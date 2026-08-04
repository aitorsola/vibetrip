import { z } from "zod";

const ConsensusBodySchema = z.object({
  ritmo_ideal: z.string(),
  intereses_comunes: z.array(z.string()),
  restricciones_alimentarias: z.array(z.string()),
  conflictos: z.array(z.string()),
  recomendacion: z.string(),
});

// Some smaller / reasoning models occasionally return `consenso` as a plain
// string (just the recommendation) instead of the full object. Coerce in
// those cases so downstream code keeps working.
const ConsensusBodyResilient = z.preprocess((val) => {
  if (typeof val === "string") {
    return {
      ritmo_ideal: "Moderado",
      intereses_comunes: [],
      restricciones_alimentarias: [],
      conflictos: [],
      recomendacion: val,
    };
  }
  if (val && typeof val === "object") {
    const v = val as Record<string, unknown>;
    return {
      ritmo_ideal: typeof v.ritmo_ideal === "string" ? v.ritmo_ideal : "Moderado",
      intereses_comunes: Array.isArray(v.intereses_comunes)
        ? v.intereses_comunes.filter((x): x is string => typeof x === "string")
        : [],
      restricciones_alimentarias: Array.isArray(v.restricciones_alimentarias)
        ? v.restricciones_alimentarias.filter(
            (x): x is string => typeof x === "string",
          )
        : [],
      conflictos: Array.isArray(v.conflictos)
        ? v.conflictos.filter((x): x is string => typeof x === "string")
        : [],
      recomendacion:
        typeof v.recomendacion === "string"
          ? v.recomendacion
          : typeof v.recommendation === "string"
            ? v.recommendation
            : "",
    };
  }
  return val;
}, ConsensusBodySchema);

export const ConsensusSchema = z.object({
  consenso: ConsensusBodyResilient,
  perfil_grupo: z.string(),
});
export type Consensus = z.infer<typeof ConsensusSchema>;
