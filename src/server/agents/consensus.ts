import "server-only";
import type { Consensus } from "@/domain/consensus";
import type { DestinationSegment, Member, Pace } from "@/domain/trip";

const PACE_RANK: Record<Pace, number> = {
  "Tranquilo (2-3 actividades/día)": 1,
  "Moderado (4-5 actividades/día)": 2,
  "Intenso (6+ actividades/día)": 3,
};

// Locale-aware labels and phrasing. We don't depend on next-intl here (the
// consensus runs in the orchestrator outside of a request context); a small
// local table is enough for the few sentences we emit.
type SupportedLocale = "es" | "en" | "fr" | "de" | "it" | "pt";

const PACE_LABEL: Record<number, Record<SupportedLocale, string>> = {
  1: { es: "Tranquilo", en: "Relaxed", fr: "Tranquille", de: "Entspannt", it: "Tranquillo", pt: "Tranquilo" },
  2: { es: "Moderado", en: "Moderate", fr: "Modéré", de: "Moderat", it: "Moderato", pt: "Moderado" },
  3: { es: "Intenso", en: "Intense", fr: "Intense", de: "Intensiv", it: "Intenso", pt: "Intenso" },
};

const TEXTS: Record<
  SupportedLocale,
  {
    pacePrefix: string;
    paceConflict: (a: string, b: string) => string;
    dietConflict: string;
    profileSolo: (interests: string, pace: string) => string;
    profileGroup: (n: number, focus: string, pace: string) => string;
    profileFocus: (interests: string) => string;
    profileFocusVaried: string;
    recoSolo: string;
    recoGroup: (n: number) => string;
    recoFocus: (interests: string) => string;
    recoPace: (pace: string) => string;
    recoDiets: (diets: string) => string;
    recoEnding: string;
    and: string;
  }
> = {
  es: {
    pacePrefix: "ritmo",
    paceConflict: (a, b) => `Ritmo dispar: ${a} prefiere tranquilo, ${b} intenso`,
    dietConflict: "Mezcla de dietas estrictas y libres: elegir restaurantes con opciones para todos",
    profileSolo: (i, p) => `Viajero individual con intereses en ${i}, ritmo ${p}.`,
    profileGroup: (n, f, p) => `Grupo de ${n} personas con ${f}, ritmo ${p}.`,
    profileFocus: (i) => `intereses comunes en ${i}`,
    profileFocusVaried: "intereses variados",
    recoSolo: "Plan a tu medida",
    recoGroup: (n) => `Plan equilibrado para ${n} personas`,
    recoFocus: (i) => `con foco en ${i}`,
    recoPace: (p) => `a ritmo ${p}`,
    recoDiets: (d) => `respetando dietas (${d})`,
    recoEnding: "y alojamiento céntrico para minimizar desplazamientos",
    and: "y",
  },
  en: {
    pacePrefix: "pace",
    paceConflict: (a, b) => `Mismatched pace: ${a} prefers relaxed, ${b} intense`,
    dietConflict: "Strict and unrestricted diets together: pick restaurants with options for everyone",
    profileSolo: (i, p) => `Solo traveller interested in ${i}, ${p} pace.`,
    profileGroup: (n, f, p) => `Group of ${n} with ${f}, ${p} pace.`,
    profileFocus: (i) => `shared interests in ${i}`,
    profileFocusVaried: "varied interests",
    recoSolo: "A plan tailored to you",
    recoGroup: (n) => `A balanced plan for ${n} people`,
    recoFocus: (i) => `focused on ${i}`,
    recoPace: (p) => `at a ${p} pace`,
    recoDiets: (d) => `respecting dietary needs (${d})`,
    recoEnding: "with a central stay to minimise travel",
    and: "and",
  },
  fr: {
    pacePrefix: "rythme",
    paceConflict: (a, b) => `Rythmes différents : ${a} préfère tranquille, ${b} intense`,
    dietConflict: "Mélange de régimes stricts et libres : choisir des restaurants avec options pour tous",
    profileSolo: (i, p) => `Voyageur seul avec des intérêts en ${i}, rythme ${p}.`,
    profileGroup: (n, f, p) => `Groupe de ${n} personnes avec ${f}, rythme ${p}.`,
    profileFocus: (i) => `intérêts communs pour ${i}`,
    profileFocusVaried: "intérêts variés",
    recoSolo: "Un plan sur mesure",
    recoGroup: (n) => `Un plan équilibré pour ${n} personnes`,
    recoFocus: (i) => `axé sur ${i}`,
    recoPace: (p) => `à un rythme ${p}`,
    recoDiets: (d) => `en respectant les régimes (${d})`,
    recoEnding: "avec un hébergement central pour limiter les trajets",
    and: "et",
  },
  de: {
    pacePrefix: "Tempo",
    paceConflict: (a, b) => `Unterschiedliches Tempo: ${a} bevorzugt entspannt, ${b} intensiv`,
    dietConflict: "Strenge und freie Diäten gemischt: Restaurants mit Optionen für alle wählen",
    profileSolo: (i, p) => `Einzelreisender mit Interessen an ${i}, ${p}es Tempo.`,
    profileGroup: (n, f, p) => `Gruppe von ${n} Personen mit ${f}, ${p}es Tempo.`,
    profileFocus: (i) => `gemeinsamen Interessen an ${i}`,
    profileFocusVaried: "vielfältigen Interessen",
    recoSolo: "Ein maßgeschneiderter Plan",
    recoGroup: (n) => `Ein ausgewogener Plan für ${n} Personen`,
    recoFocus: (i) => `mit Schwerpunkt auf ${i}`,
    recoPace: (p) => `in ${p}em Tempo`,
    recoDiets: (d) => `mit Rücksicht auf Diäten (${d})`,
    recoEnding: "und einer zentralen Unterkunft, um Wege zu sparen",
    and: "und",
  },
  it: {
    pacePrefix: "ritmo",
    paceConflict: (a, b) => `Ritmi diversi: ${a} preferisce tranquillo, ${b} intenso`,
    dietConflict: "Diete strette e libere insieme: scegliere ristoranti con opzioni per tutti",
    profileSolo: (i, p) => `Viaggiatore solo con interessi per ${i}, ritmo ${p}.`,
    profileGroup: (n, f, p) => `Gruppo di ${n} persone con ${f}, ritmo ${p}.`,
    profileFocus: (i) => `interessi comuni per ${i}`,
    profileFocusVaried: "interessi vari",
    recoSolo: "Un piano su misura",
    recoGroup: (n) => `Un piano equilibrato per ${n} persone`,
    recoFocus: (i) => `con focus su ${i}`,
    recoPace: (p) => `a ritmo ${p}`,
    recoDiets: (d) => `rispettando le diete (${d})`,
    recoEnding: "e un alloggio centrale per ridurre gli spostamenti",
    and: "e",
  },
  pt: {
    pacePrefix: "ritmo",
    paceConflict: (a, b) => `Ritmos diferentes: ${a} prefere tranquilo, ${b} intenso`,
    dietConflict: "Mistura de dietas estritas e livres: escolher restaurantes com opções para todos",
    profileSolo: (i, p) => `Viajante individual com interesses em ${i}, ritmo ${p}.`,
    profileGroup: (n, f, p) => `Grupo de ${n} pessoas com ${f}, ritmo ${p}.`,
    profileFocus: (i) => `interesses comuns em ${i}`,
    profileFocusVaried: "interesses variados",
    recoSolo: "Um plano à tua medida",
    recoGroup: (n) => `Um plano equilibrado para ${n} pessoas`,
    recoFocus: (i) => `com foco em ${i}`,
    recoPace: (p) => `a ritmo ${p}`,
    recoDiets: (d) => `respeitando as dietas (${d})`,
    recoEnding: "e um alojamento central para reduzir deslocações",
    and: "e",
  },
};

function safeLocale(loc: string | undefined): SupportedLocale {
  return (loc as SupportedLocale) in TEXTS ? (loc as SupportedLocale) : "es";
}

function median(nums: number[]): number {
  if (nums.length === 0) return 2;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function commonInterests(members: Member[]): string[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    const seen = new Set<string>();
    for (const raw of m.interests) {
      const key = raw.trim();
      if (!key || seen.has(key.toLowerCase())) continue;
      seen.add(key.toLowerCase());
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = members.length === 1 ? 1 : Math.ceil(members.length / 2);
  return [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
}

function dietaryRestrictions(members: Member[]): string[] {
  const restrictions = new Set<string>();
  for (const m of members) {
    if (m.food && m.food !== "Sin restricciones") restrictions.add(m.food);
  }
  return [...restrictions];
}

function conflicts(members: Member[], texts: (typeof TEXTS)[SupportedLocale]): string[] {
  if (members.length < 2) return [];
  const out: string[] = [];

  const paces = members.map((m) => ({ name: m.name, rank: PACE_RANK[m.pace] }));
  const minPace = paces.reduce((a, b) => (a.rank <= b.rank ? a : b));
  const maxPace = paces.reduce((a, b) => (a.rank >= b.rank ? a : b));
  if (maxPace.rank - minPace.rank >= 2) {
    out.push(texts.paceConflict(minPace.name, maxPace.name));
  }

  const meatEaters = members.filter((m) => m.food === "Sin restricciones").length;
  const strict = members.filter(
    (m) => m.food === "Vegano" || m.food === "Halal",
  ).length;
  if (meatEaters > 0 && strict > 0) {
    out.push(texts.dietConflict);
  }

  return out;
}

function profile(
  members: Member[],
  paceLabel: string,
  texts: (typeof TEXTS)[SupportedLocale],
): string {
  if (members.length === 1) {
    const m = members[0]!;
    return texts.profileSolo(
      m.interests.slice(0, 3).join(", "),
      paceLabel.toLowerCase(),
    );
  }
  const interests = commonInterests(members).slice(0, 3);
  const focus =
    interests.length > 0
      ? texts.profileFocus(interests.join(", "))
      : texts.profileFocusVaried;
  return texts.profileGroup(members.length, focus, paceLabel.toLowerCase());
}

function recommendation(
  members: Member[],
  paceLabel: string,
  interests: string[],
  restrictions: string[],
  texts: (typeof TEXTS)[SupportedLocale],
): string {
  const parts: string[] = [];
  if (members.length === 1) {
    parts.push(texts.recoSolo);
  } else {
    parts.push(texts.recoGroup(members.length));
  }
  if (interests.length > 0) {
    parts.push(
      texts.recoFocus(interests.slice(0, 2).join(` ${texts.and} `)),
    );
  }
  parts.push(texts.recoPace(paceLabel.toLowerCase()));
  if (restrictions.length > 0) {
    parts.push(texts.recoDiets(restrictions.join(", ")));
  }
  parts.push(texts.recoEnding);
  return parts.join(", ") + ".";
}

export function computeConsensus(
  _destinations: DestinationSegment[],
  members: Member[],
  locale: string = "es",
): Consensus {
  const lc = safeLocale(locale);
  const texts = TEXTS[lc];
  const paceRank = median(members.map((m) => PACE_RANK[m.pace]));
  const paceLabel = PACE_LABEL[paceRank]?.[lc] ?? PACE_LABEL[2]![lc];
  const intereses_comunes = commonInterests(members);
  const restricciones_alimentarias = dietaryRestrictions(members);
  const conflictos = conflicts(members, texts);

  return {
    consenso: {
      ritmo_ideal: paceLabel,
      intereses_comunes,
      restricciones_alimentarias,
      conflictos,
      recomendacion: recommendation(
        members,
        paceLabel,
        intereses_comunes,
        restricciones_alimentarias,
        texts,
      ),
    },
    perfil_grupo: profile(members, paceLabel, texts),
  };
}
