"use client";

import { jsPDF } from "jspdf";
import type { Accommodation } from "@/domain/accommodation";
import type { Budget } from "@/domain/budget";
import type { Consensus } from "@/domain/consensus";
import type { Activity, ActivityType, Itinerary } from "@/domain/itinerary";
import type { PlanResult } from "@/domain/plan";
import { nightsBetween, totalNights, type DestinationSegment, type Member } from "@/domain/trip";

/** All user-facing strings the PDF uses. The caller fills it from the
 *  active i18n locale, so this module stays presentation-only and never
 *  hardcodes Spanish or any other language. */
export interface PdfLabels {
  subtitle: string;
  summary: (members: number, nights: number) => string;
  destinationsTitle: string;
  destinationLine: (args: {
    from: string;
    to: string;
    nights: number;
    budget: number;
  }) => string;
  consensusTitle: string;
  recommendation: string;
  groupSection: string;
  groupSectionTitle: string;
  itinerarySection: string;
  accommodationSection: string;
  budgetSection: string;
  travellersSection: string;
  travellersSectionTitle: string;
  destinationDivider: (n: number, total: number) => string;
  /** Per-section banner — joins tag number, label and (optional) suffix. */
  buildTag: (number: number, label: string, suffix?: string) => string;
  /** Headers inside cards. */
  perPerson: string;
  groupTotal: string;
  nights: string;
  activities: string;
  paceLabel: string;
  interestsLabel: string;
  restrictionsLabel: string;
  conflictsLabel: string;
  noRestrictions: string;
  pros: string;
  cons: string;
  tip: string;
  ifRains: string;
  breakdown: string;
  totalPerPerson: string;
  groupTotalLine: (count: number) => string;
  inBudget: string;
  overBudget: string;
  budgetVerdictLine: (goal: number, estimated: number, diff: number) => string;
  notIncluded: string;
  pdfNotesLabel: string;
  pdfInterestsLabel: string;
  fieldAddress: string;
  fieldNeighbourhood: string;
  fieldTransport: string;
  fieldDuration: string;
  fieldReservation: string;
  fieldWeb: string;
  free: string;
  perPaxSuffix: string;
  minutesUnit: string;
  optionLabel: (n: number, type: string) => string;
  itinerarySectionTitle: (dest: string) => string;
  accommodationSectionTitle: (dest: string) => string;
  budgetSectionTitle: (dest: string) => string;
  /** Localised slot label (manana/almuerzo/tarde/cena). */
  slot: (key: "manana" | "almuerzo" | "tarde" | "cena") => string;
  /** Localised activity type. */
  type: (key: ActivityType) => string;
}

interface ExportPlanArgs {
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
  labels: PdfLabels;
  locale: string;
}

// ── Palette ──────────────────────────────────────────────────────
const BRAND   = "#00AC00";
const BRAND_D = "#008C00";
const INK     = "#111111";
const MUTED   = "#6B7280";
const SUBTLE  = "#9CA3AF";
const RULE    = "#E5E7EB";
const SURFACE = "#F9FAFB";
const WHITE   = "#FFFFFF";
const PINK    = "#E91E63";
const PURPLE  = "#7C4DFF";
const TEAL    = "#00ACC1";
const ORANGE  = "#F97316";
const SUCCESS = "#059669";
const DANGER  = "#DC2626";

const TYPE_COLOR: Record<ActivityType, string> = {
  cultura:    PURPLE,
  comida:     ORANGE,
  naturaleza: TEAL,
  ocio:       PINK,
  transporte: "#64748B",
};

// ── WinAnsi safety ───────────────────────────────────────────────
function ascii(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[→➞➔]/g, "-")
    .replace(/[✓✔]/g, "")
    .replace(/[⚠△▲]/g, "!")
    .replace(/[^\x00-\xFF]/g, "");
}

// ── Page geometry ────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const M      = 16;
const PW     = PAGE_W - M * 2;
const SAFE_B = PAGE_H - M - 10;

interface Cursor { doc: jsPDF; y: number; }

function setFont(doc: jsPDF, size: number, weight: "normal" | "bold" = "normal", color = INK) {
  doc.setFont("helvetica", weight);
  doc.setFontSize(size);
  doc.setTextColor(color);
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: string, r = 0) {
  doc.setFillColor(color);
  if (r > 0) doc.roundedRect(x, y, w, h, r, r, "F");
  else doc.rect(x, y, w, h, "F");
}

const lh = (size: number) => size * 0.353 * 1.45;

function guard(c: Cursor, needed: number) {
  if (c.y + needed > SAFE_B) {
    c.doc.addPage();
    c.y = M;
  }
}

function rule(c: Cursor, color = RULE, lw = 0.2) {
  c.doc.setDrawColor(color);
  c.doc.setLineWidth(lw);
  c.doc.line(M, c.y, PAGE_W - M, c.y);
  c.y += 4;
}

function softColor(hex: string, mix = 0.12): string {
  const c = hex.replace("#", "");
  const m = (v: number) =>
    Math.round(parseInt(c.slice(v, v + 2), 16) * mix + 255 * (1 - mix));
  return `#${m(0).toString(16).padStart(2, "0")}${m(2).toString(16).padStart(2, "0")}${m(4).toString(16).padStart(2, "0")}`;
}

function pill(c: Cursor, x: number, y: number, label: string, color: string): number {
  setFont(c.doc, 7, "bold", color);
  const w = c.doc.getTextWidth(label) + 5;
  fillRect(c.doc, x, y - 3.6, w, 5, softColor(color, 0.15), 1.5);
  setFont(c.doc, 7, "bold", color);
  c.doc.text(label, x + 2.5, y);
  return w;
}

function paragraph(
  c: Cursor,
  str: string,
  opts: {
    size?: number; weight?: "normal" | "bold"; color?: string;
    x?: number; width?: number;
  } = {},
) {
  const size   = opts.size   ?? 10;
  const weight = opts.weight ?? "normal";
  const color  = opts.color  ?? INK;
  const x      = opts.x      ?? M;
  const w      = opts.width  ?? PW - (x - M);
  setFont(c.doc, size, weight, color);
  const lines = c.doc.splitTextToSize(ascii(str), w) as string[];
  for (const line of lines) {
    guard(c, lh(size) + 1);
    c.doc.text(line, x, c.y);
    c.y += lh(size);
  }
}

function makeFormatDate(locale: string) {
  return (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
}

// ── Section banner ───────────────────────────────────────────────

function sectionBanner(c: Cursor, tag: string, title: string) {
  guard(c, 22);
  c.y += 2;
  fillRect(c.doc, M, c.y, 3, 14, BRAND);
  setFont(c.doc, 7, "bold", BRAND);
  c.doc.text(ascii(tag.toUpperCase()), M + 6, c.y + 4);
  setFont(c.doc, 18, "bold", INK);
  c.doc.text(ascii(title), M + 6, c.y + 12);
  c.y += 18;
  rule(c, RULE, 0.3);
  c.y += 3;
}

// ── COVER ────────────────────────────────────────────────────────

function renderCover(c: Cursor, args: ExportPlanArgs) {
  const { destinations, members, result, labels, locale } = args;
  const formatDate = makeFormatDate(locale);
  const nights = totalNights(destinations);
  const totalActs = result.destinations.reduce(
    (s, dr) => s + dr.itinerary.itinerario.reduce((ss, d) => ss + d.actividades.length, 0),
    0,
  );
  const avgBudgetPerPerson = Math.round(
    result.destinations.reduce((s, dr) => s + dr.budget.presupuesto.total_persona, 0) /
      result.destinations.length,
  );
  const totalGroupBudget = Math.round(
    result.destinations.reduce((s, dr) => s + dr.budget.presupuesto.total_grupo, 0),
  );

  const destTitle =
    destinations.length === 1
      ? destinations[0]!.destination
      : destinations.map((d) => d.destination).join("  ·  ");

  const dateStr =
    destinations.length === 1
      ? `${formatDate(destinations[0]!.startDate)} — ${formatDate(destinations[0]!.endDate)}`
      : `${destinations.length}`;

  const HERO = 90;
  fillRect(c.doc, 0, 0, PAGE_W, HERO, BRAND);
  fillRect(c.doc, 0, HERO - 1, PAGE_W, 1, BRAND_D);

  setFont(c.doc, 14, "bold", WHITE);
  c.doc.text("vibetrip", M, 17);
  setFont(c.doc, 8, "normal", "#FFFFFFB3");
  c.doc.text(ascii(labels.subtitle), M, 23);

  setFont(c.doc, 8, "normal", "#FFFFFFB3");
  c.doc.text(ascii(dateStr), PAGE_W - M - c.doc.getTextWidth(ascii(dateStr)), 17);

  setFont(c.doc, destinations.length === 1 ? 36 : 26, "bold", WHITE);
  const destLines = c.doc.splitTextToSize(ascii(destTitle), PW) as string[];
  let destY = 46;
  for (const line of destLines) {
    c.doc.text(line, M, destY);
    destY += destinations.length === 1 ? 13 : 10;
  }

  setFont(c.doc, 10, "normal", "#FFFFFFCC");
  c.doc.text(ascii(labels.summary(members.length, nights)), M, HERO - 9);

  c.y = HERO + 12;

  const kpis = [
    { label: labels.perPerson,  value: `${avgBudgetPerPerson}€`,  color: BRAND },
    { label: labels.groupTotal, value: `${totalGroupBudget}€`,    color: INK },
    { label: labels.nights,     value: String(nights),            color: PURPLE },
    { label: labels.activities, value: String(totalActs),         color: TEAL },
  ];
  const GAP   = 3;
  const cardW = (PW - GAP * 3) / 4;
  const cardH = 28;

  for (let i = 0; i < kpis.length; i++) {
    const k = kpis[i]!;
    const x = M + i * (cardW + GAP);
    fillRect(c.doc, x, c.y, cardW, cardH, WHITE, 2);
    c.doc.setDrawColor(RULE);
    c.doc.setLineWidth(0.3);
    c.doc.roundedRect(x, c.y, cardW, cardH, 2, 2, "D");
    fillRect(c.doc, x, c.y, 4, cardH, k.color, 2);
    fillRect(c.doc, x, c.y + cardH - 2, 4, 2, k.color);
    setFont(c.doc, 6.5, "bold", MUTED);
    c.doc.text(ascii(k.label.toUpperCase()), x + 8, c.y + 10);
    setFont(c.doc, 18, "bold", INK);
    c.doc.text(ascii(k.value), x + 8, c.y + 22);
  }
  c.y += cardH + 12;

  if (destinations.length > 1) {
    setFont(c.doc, 7, "bold", BRAND);
    c.doc.text(ascii(labels.destinationsTitle), M, c.y);
    c.y += 5;
    for (const d of destinations) {
      const dn = nightsBetween(d.startDate, d.endDate);
      setFont(c.doc, 10, "bold", INK);
      c.doc.text(ascii(d.destination), M + 4, c.y);
      setFont(c.doc, 9, "normal", MUTED);
      c.doc.text(
        ascii(
          labels.destinationLine({
            from: formatDate(d.startDate),
            to: formatDate(d.endDate),
            nights: dn,
            budget: d.budget,
          }),
        ),
        M + 4,
        c.y + 5,
      );
      c.y += 13;
    }
    c.y += 2;
  }

  setFont(c.doc, 7, "bold", BRAND);
  c.doc.text(ascii(labels.consensusTitle), M, c.y);
  c.y += 4;
  setFont(c.doc, 14, "bold", INK);
  c.doc.text(ascii(labels.recommendation), M, c.y + 5);
  c.y += 11;

  const recText = `"${ascii(result.consensus.consenso.recomendacion)}"`;
  setFont(c.doc, 11, "normal", INK);
  const recLines = c.doc.splitTextToSize(recText, PW - 10) as string[];
  const recH = recLines.length * lh(11) + 8;
  fillRect(c.doc, M, c.y, PW, recH, SURFACE, 2);
  fillRect(c.doc, M, c.y, 3, recH, BRAND, 2);
  fillRect(c.doc, M, c.y + recH - 2, 3, 2, BRAND);
  setFont(c.doc, 11, "normal", INK);
  for (let i = 0; i < recLines.length; i++) {
    c.doc.text(recLines[i]!, M + 7, c.y + 5.5 + i * lh(11));
  }
  c.y += recH + 5;

  paragraph(c, result.consensus.perfil_grupo, { size: 9.5, color: MUTED });
  c.y += 3;
  setFont(c.doc, 9, "normal", SUBTLE);
  c.doc.text(ascii(members.map((m) => m.name).join("  ·  ")), M, c.y);
}

// ── CONSENSUS ────────────────────────────────────────────────────

function renderConsensus(c: Cursor, consensus: Consensus, labels: PdfLabels) {
  c.doc.addPage();
  c.y = M;
  sectionBanner(
    c,
    labels.buildTag(1, labels.groupSection),
    labels.groupSectionTitle,
  );

  const co = consensus.consenso;
  const items: Array<{ label: string; value: string; color: string }> = [
    { label: labels.paceLabel, value: co.ritmo_ideal, color: TEAL },
    {
      label: labels.interestsLabel,
      value: co.intereses_comunes.join("  ·  ") || "—",
      color: PURPLE,
    },
    {
      label: labels.restrictionsLabel,
      value:
        co.restricciones_alimentarias.join("  ·  ") || labels.noRestrictions,
      color: ORANGE,
    },
  ];
  if (co.conflictos.length > 0) {
    items.push({
      label: labels.conflictsLabel,
      value: co.conflictos.join("  ·  "),
      color: PINK,
    });
  }

  for (const item of items) {
    guard(c, 22);
    fillRect(c.doc, M, c.y - 0.5, 2, 14, item.color);
    setFont(c.doc, 7.5, "bold", item.color);
    c.doc.text(ascii(item.label.toUpperCase()), M + 5, c.y + 3);
    c.y += 7;
    paragraph(c, item.value, { size: 11, color: INK, x: M + 5, width: PW - 5 });
    c.y += 5;
    rule(c, RULE);
  }
}

// ── ITINERARY ────────────────────────────────────────────────────

function infoRow(c: Cursor, label: string, value: string, x: number) {
  setFont(c.doc, 6.8, "bold", MUTED);
  c.doc.text(label.toUpperCase(), x, c.y);
  setFont(c.doc, 9, "normal", INK);
  const labelW = 22;
  const lines = c.doc.splitTextToSize(ascii(value), PW - labelW - (x - M)) as string[];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      c.y += lh(9);
      guard(c, lh(9));
    }
    c.doc.text(lines[i]!, x + labelW, c.y);
  }
  c.y += lh(9) + 1;
}

function renderActivity(c: Cursor, act: Activity, labels: PdfLabels) {
  const tipo = TYPE_COLOR[act.tipo];

  const nameLines = c.doc.splitTextToSize(ascii(act.nombre), PW - 14) as string[];
  guard(c, 16 + nameLines.length * lh(12));

  const blockStart = c.y;

  setFont(c.doc, 11, "bold", INK);
  c.doc.text(ascii(act.hora), M + 5, c.y);

  const slotLabel = act.bloque
    ? labels.slot(act.bloque as "manana" | "almuerzo" | "tarde" | "cena")
    : null;
  if (slotLabel) {
    setFont(c.doc, 7, "normal", MUTED);
    c.doc.text(ascii(slotLabel), M + 22, c.y);
  }

  const pillX = M + (slotLabel ? 42 : 22);
  pill(c, pillX, c.y, labels.type(act.tipo), tipo);

  const costTxt =
    act.coste_persona > 0
      ? `${act.coste_persona}€${labels.perPaxSuffix}`
      : labels.free;
  setFont(c.doc, 9, "bold", act.coste_persona > 0 ? INK : SUCCESS);
  c.doc.text(ascii(costTxt), PAGE_W - M - c.doc.getTextWidth(ascii(costTxt)), c.y);

  c.y += 6;

  setFont(c.doc, 12.5, "bold", INK);
  for (const line of nameLines) {
    guard(c, lh(12.5));
    c.doc.text(line, M + 5, c.y);
    c.y += lh(12.5);
  }
  c.y += 1;

  paragraph(c, act.descripcion, {
    size: 9.5, color: "#374151", x: M + 5, width: PW - 5,
  });
  c.y += 2;

  const infoX = M + 5;
  if (act.direccion)        infoRow(c, labels.fieldAddress,       act.direccion, infoX);
  if (act.barrio)           infoRow(c, labels.fieldNeighbourhood, act.barrio, infoX);
  if (act.transporte)       infoRow(c, labels.fieldTransport,     act.transporte, infoX);
  if (act.duracion_min > 0) {
    infoRow(c, labels.fieldDuration, `${act.duracion_min} ${labels.minutesUnit}`, infoX);
  }
  if (act.reserva)          infoRow(c, labels.fieldReservation,   act.reserva, infoX);
  if (act.web)              infoRow(c, labels.fieldWeb,           act.web, infoX);

  if (act.tip) {
    c.y += 1;
    const tipLines = c.doc.splitTextToSize(ascii(act.tip), PW - 18) as string[];
    const tipH = tipLines.length * lh(9) + 6;
    guard(c, tipH);
    fillRect(c.doc, M + 5, c.y, PW - 5, tipH, softColor(SUCCESS, 0.1), 2);
    setFont(c.doc, 6.8, "bold", SUCCESS);
    c.doc.text(ascii(labels.tip), M + 9, c.y + 4.5);
    setFont(c.doc, 9, "normal", "#065F46");
    for (let i = 0; i < tipLines.length; i++) {
      c.doc.text(tipLines[i]!, M + 25, c.y + 4.5 + i * lh(9));
    }
    c.y += tipH + 2;
  }

  if (act.alternativa_lluvia) {
    setFont(c.doc, 6.8, "bold", MUTED);
    c.doc.text(ascii(labels.ifRains), M + 5, c.y);
    setFont(c.doc, 9, "normal", MUTED);
    const altLines = c.doc.splitTextToSize(ascii(act.alternativa_lluvia), PW - 25) as string[];
    for (let i = 0; i < altLines.length; i++) {
      if (i > 0) { c.y += lh(9); guard(c, lh(9)); }
      c.doc.text(altLines[i]!, M + 25, c.y);
    }
    c.y += lh(9) + 1;
  }

  fillRect(c.doc, M, blockStart - 3, 2, c.y - blockStart + 3, tipo);

  c.y += 5;
  rule(c, "#EEEEEE", 0.15);
  c.y += 2;
}

function renderItinerarySection(
  c: Cursor,
  itin: Itinerary,
  tag: string,
  destName: string,
  labels: PdfLabels,
) {
  c.doc.addPage();
  c.y = M;
  sectionBanner(c, tag, labels.itinerarySectionTitle(destName));

  for (const day of itin.itinerario) {
    guard(c, 30);

    const BANNER_H = 18;
    fillRect(c.doc, M, c.y, PW, BANNER_H, BRAND, 2);
    fillRect(c.doc, M + 3, c.y + 2, 14, 14, BRAND_D, 2);
    setFont(c.doc, 9, "bold", WHITE);
    const dayStr = String(day.dia).padStart(2, "0");
    c.doc.text(dayStr, M + 10 - c.doc.getTextWidth(dayStr) / 2, c.y + 11);

    setFont(c.doc, 12, "bold", WHITE);
    c.doc.text(ascii(day.titulo), M + 21, c.y + 8);

    if (day.zona) {
      setFont(c.doc, 8, "normal", "#FFFFFFCC");
      const zw = c.doc.getTextWidth(ascii(day.zona));
      c.doc.text(ascii(day.zona), PAGE_W - M - zw - 4, c.y + 13);
    }

    c.y += BANNER_H + 5;

    if (day.resumen) {
      paragraph(c, day.resumen, { size: 9.5, color: MUTED });
      c.y += 3;
    }

    for (const act of day.actividades) {
      renderActivity(c, act, labels);
    }

    c.y += 3;
  }
}

// ── ACCOMMODATION ────────────────────────────────────────────────

function bullet(c: Cursor, color: string, text: string) {
  c.doc.setFillColor(color);
  c.doc.circle(M + 1.5, c.y - 1.2, 1, "F");
  const lines = c.doc.splitTextToSize(ascii(text), PW - 8) as string[];
  setFont(c.doc, 9.5, "normal", INK);
  for (const l of lines) {
    guard(c, lh(9.5));
    c.doc.text(l, M + 5, c.y);
    c.y += lh(9.5);
  }
}

function renderAccommodationSection(
  c: Cursor,
  acc: Accommodation,
  tag: string,
  destName: string,
  labels: PdfLabels,
) {
  c.doc.addPage();
  c.y = M;
  sectionBanner(c, tag, labels.accommodationSectionTitle(destName));

  for (let i = 0; i < acc.opciones.length; i++) {
    const op = acc.opciones[i]!;
    guard(c, 55);

    setFont(c.doc, 7, "bold", MUTED);
    c.doc.text(
      ascii(labels.optionLabel(i + 1, op.tipo).toUpperCase()),
      M, c.y + 4,
    );

    c.y += 9;

    setFont(c.doc, 15, "bold", INK);
    c.doc.text(ascii(op.nombre_ejemplo), M, c.y);
    c.y += 6;

    setFont(c.doc, 9, "normal", MUTED);
    c.doc.text(ascii(op.zona), M, c.y);
    c.y += 8;

    if (op.pros.length > 0) {
      setFont(c.doc, 7.5, "bold", SUCCESS);
      c.doc.text(ascii(labels.pros), M, c.y);
      c.y += 5;
      for (const pro of op.pros) bullet(c, SUCCESS, pro);
      c.y += 2;
    }

    if (op.contras.length > 0) {
      setFont(c.doc, 7.5, "bold", PINK);
      c.doc.text(ascii(labels.cons), M, c.y);
      c.y += 5;
      for (const con of op.contras) bullet(c, PINK, con);
    }

    c.y += 6;
    rule(c, RULE);
    c.y += 3;
  }
}

// ── BUDGET ───────────────────────────────────────────────────────

function renderBudget(
  c: Cursor,
  trip: DestinationSegment,
  members: Member[],
  budget: Budget,
  tag: string,
  labels: PdfLabels,
) {
  c.doc.addPage();
  c.y = M;
  sectionBanner(c, tag, labels.budgetSectionTitle(trip.destination));

  const p = budget.presupuesto;
  const rows: Array<{ label: string; value: number; color: string }> = [
    { label: labels.activities, value: p.actividades_total_persona, color: PINK },
  ];

  const maxVal = Math.max(...rows.map((r) => r.value), 1);
  const LABEL_W = 50;
  const VALUE_W = 18;
  const BAR_W   = PW - LABEL_W - VALUE_W - 6;

  setFont(c.doc, 10, "bold", INK);
  c.doc.text(ascii(labels.breakdown), M, c.y);
  c.y += 9;

  for (const row of rows) {
    guard(c, 11);
    const rowY = c.y;
    setFont(c.doc, 9.5, "normal", INK);
    c.doc.text(ascii(row.label), M, rowY);
    setFont(c.doc, 9.5, "bold", INK);
    c.doc.text(`${Math.round(row.value)}€`, M + LABEL_W + VALUE_W, rowY, { align: "right" });
    const barX = M + LABEL_W + VALUE_W + 6;
    const barY = rowY - 3.4;
    const barH = 4.5;
    fillRect(c.doc, barX, barY, BAR_W, barH, RULE, barH / 2);
    const fillW = Math.max((row.value / maxVal) * BAR_W, 2);
    fillRect(c.doc, barX, barY, fillW, barH, row.color, barH / 2);
    c.y += 9;
  }

  c.y += 2;
  c.doc.setDrawColor(INK);
  c.doc.setLineWidth(0.5);
  c.doc.line(M, c.y, PAGE_W - M, c.y);
  c.y += 9;

  setFont(c.doc, 8, "bold", MUTED);
  c.doc.text(ascii(labels.totalPerPerson), M, c.y);
  setFont(c.doc, 26, "bold", BRAND);
  const tpTxt = `${Math.round(p.total_persona)}€`;
  c.doc.text(tpTxt, PAGE_W - M - c.doc.getTextWidth(tpTxt), c.y + 5);
  c.y += 12;

  setFont(c.doc, 9, "normal", MUTED);
  c.doc.text(ascii(labels.groupTotalLine(members.length)), M, c.y);
  setFont(c.doc, 14, "bold", INK);
  const tgTxt = `${Math.round(p.total_grupo)}€`;
  c.doc.text(tgTxt, PAGE_W - M - c.doc.getTextWidth(tgTxt), c.y);
  c.y += 14;

  const inBudget = p.dentro_presupuesto;
  const vc = inBudget ? SUCCESS : DANGER;
  fillRect(c.doc, M, c.y, PW, 22, softColor(vc), 2);
  fillRect(c.doc, M, c.y, 4, 22, vc, 2);
  fillRect(c.doc, M, c.y + 20, 4, 2, vc);
  setFont(c.doc, 10, "bold", vc);
  c.doc.text(
    ascii(inBudget ? labels.inBudget : labels.overBudget),
    M + 10, c.y + 9,
  );
  setFont(c.doc, 9, "normal", INK);
  c.doc.text(
    ascii(
      labels.budgetVerdictLine(
        trip.budget,
        Math.round(p.total_persona),
        Math.round(p.total_persona - trip.budget),
      ),
    ),
    M + 10, c.y + 16,
  );
  c.y += 28;

  setFont(c.doc, 8, "normal", MUTED);
  c.doc.text(ascii(labels.notIncluded), M, c.y);
  c.y += 8;
}

// ── TRAVELERS ────────────────────────────────────────────────────

function renderTravelers(c: Cursor, members: Member[], labels: PdfLabels) {
  c.doc.addPage();
  c.y = M;
  sectionBanner(
    c,
    labels.buildTag(5, labels.travellersSection),
    labels.travellersSectionTitle,
  );

  for (const m of members) {
    guard(c, 30);

    const initial = (m.name[0] ?? "?").toUpperCase();
    c.doc.setFillColor(BRAND);
    c.doc.circle(M + 4, c.y, 4, "F");
    setFont(c.doc, 9, "bold", WHITE);
    c.doc.text(
      ascii(initial),
      M + 4 - c.doc.getTextWidth(ascii(initial)) / 2,
      c.y + 1.5,
    );

    setFont(c.doc, 14, "bold", INK);
    c.doc.text(ascii(m.name), M + 12, c.y + 1);
    c.y += 5;
    setFont(c.doc, 9, "normal", MUTED);
    c.doc.text(
      ascii(`${m.food}  ·  ${m.pace.split(" (")[0]}`),
      M + 12, c.y + 1,
    );
    c.y += 7;

    if (m.interests.length > 0) {
      setFont(c.doc, 6.8, "bold", MUTED);
      c.doc.text(ascii(labels.pdfInterestsLabel), M + 12, c.y);
      c.y += 4;
      paragraph(c, m.interests.join(", "), {
        size: 9.5, color: INK, x: M + 12, width: PW - 12,
      });
    }
    if (m.notes) {
      c.y += 1;
      setFont(c.doc, 6.8, "bold", MUTED);
      c.doc.text(ascii(labels.pdfNotesLabel), M + 12, c.y);
      c.y += 4;
      paragraph(c, `"${m.notes}"`, {
        size: 9, color: MUTED, x: M + 12, width: PW - 12,
      });
    }
    c.y += 4;
    rule(c, RULE);
    c.y += 3;
  }
}

// ── FOOTERS ──────────────────────────────────────────────────────

function renderFooters(doc: jsPDF, destinations: DestinationSegment[]) {
  const subtitle =
    destinations.length === 1
      ? destinations[0]!.destination
      : destinations.map((d) => d.destination).join("  ·  ");
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      doc.setDrawColor(RULE);
      doc.setLineWidth(0.25);
      doc.line(M, PAGE_H - 10, PAGE_W - M, PAGE_H - 10);
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(BRAND);
    doc.text("vibetrip", M, PAGE_H - 5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SUBTLE);
    doc.text(
      ascii(`  ·  ${subtitle}`),
      M + doc.getTextWidth("vibetrip"),
      PAGE_H - 5.5,
    );
    const pg = `${i} / ${pages}`;
    doc.text(pg, PAGE_W - M - doc.getTextWidth(pg), PAGE_H - 5.5);
  }
}

// ── DESTINATION SECTION DIVIDER ───────────────────────────────────

function renderDestinationDivider(
  c: Cursor,
  dest: DestinationSegment,
  destNum: number,
  total: number,
  labels: PdfLabels,
  locale: string,
) {
  if (total <= 1) return;
  const formatDate = makeFormatDate(locale);
  c.doc.addPage();
  c.y = M;
  const HERO = 50;
  fillRect(c.doc, 0, 0, PAGE_W, HERO, BRAND);
  setFont(c.doc, 9, "bold", "#FFFFFFB3");
  c.doc.text(ascii(labels.destinationDivider(destNum, total)), M, 18);
  setFont(c.doc, 28, "bold", WHITE);
  c.doc.text(ascii(dest.destination), M, 38);
  setFont(c.doc, 8, "normal", "#FFFFFFCC");
  const dn = nightsBetween(dest.startDate, dest.endDate);
  c.doc.text(
    ascii(
      labels.destinationLine({
        from: formatDate(dest.startDate),
        to: formatDate(dest.endDate),
        nights: dn,
        budget: dest.budget,
      }),
    ),
    M,
    HERO - 8,
  );
  c.y = HERO + 6;
}

// ── ENTRY ────────────────────────────────────────────────────────

export function exportPlanToPdf({
  destinations,
  members,
  result,
  labels,
  locale,
}: ExportPlanArgs) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const titleDest =
    destinations.length === 1
      ? destinations[0]!.destination
      : destinations.map((d) => d.destination).join(", ");
  doc.setProperties({
    title:    `vibetrip — ${titleDest}`,
    subject:  labels.subtitle,
    author:   "vibetrip",
    keywords: "trip, plan, vibetrip",
  });
  const c: Cursor = { doc, y: M };

  renderCover(c, { destinations, members, result, labels, locale });
  renderConsensus(c, result.consensus, labels);

  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i]!;
    const dr = result.destinations[i]!;
    const base = 2 + i * 3;

    renderDestinationDivider(c, dest, i + 1, destinations.length, labels, locale);

    const itTag = labels.buildTag(
      base,
      labels.itinerarySection,
      destinations.length > 1 ? String(i + 1) : undefined,
    );
    renderItinerarySection(c, dr.itinerary, itTag, dest.destination, labels);

    if (dr.accommodation) {
      const accTag = labels.buildTag(
        base + 1,
        labels.accommodationSection,
        destinations.length > 1 ? String(i + 1) : undefined,
      );
      renderAccommodationSection(c, dr.accommodation, accTag, dest.destination, labels);
    }

    const budgTag = labels.buildTag(base + 2, labels.budgetSection);
    renderBudget(c, dest, members, dr.budget, budgTag, labels);
  }
  renderTravelers(c, members, labels);
  renderFooters(doc, destinations);

  const safeDest = destinations
    .map((d) =>
      d.destination
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .join("-");
  const startDate = destinations[0]?.startDate ?? "";
  doc.save(`vibetrip-${safeDest}-${startDate}.pdf`);
}
