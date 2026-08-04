"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations, useLocale } from "next-intl";
import type { PlanResult } from "@/domain/plan";
import { nightsBetween, totalNights, type DestinationSegment, type Member } from "@/domain/trip";
import { buildBookingSearchUrl } from "@/domain/booking";
import { flagForDestination } from "@/domain/countries";
import { Button } from "@/ui/Button";
import { AccommodationView } from "./AccommodationView";
import { BudgetView } from "./BudgetView";
import { GroupView } from "./GroupView";
import { ItineraryView } from "./ItineraryView";

// Leaflet uses window/document at module load, so it can't be SSR'd. Lazy
// load on the client only.
const MapView = dynamic(() => import("./MapView.client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] items-center justify-center rounded-3xl border border-border bg-surface text-[13px] text-muted">
      …
    </div>
  ),
});

type ContentTab = "itinerario" | "mapa" | "alojamiento" | "presupuesto" | "grupo";

function formatDateRange(start: string, end: string, locale: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  return `${fmt(start)} → ${fmt(end)}`;
}

interface ResultsPageProps {
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
  onReset: () => void;
  /** What the reset button says. Each caller means something different by it:
   *  a fresh plan, going back to the trip list, or leaving a shared link. */
  resetLabel?: string;
  /** Extra trip-level actions, rendered next to reset so every action the
   *  page offers lives in one row instead of stacking at different widths. */
  actions?: ReactNode;
}

export function ResultsPage({
  destinations,
  members,
  result,
  onReset,
  resetLabel,
  actions,
}: ResultsPageProps) {
  const t = useTranslations("results");
  const locale = useLocale();
  const [activeDest, setActiveDest] = useState(0);
  const [tab, setTab] = useState<ContentTab>("itinerario");

  const multiDest = destinations.length > 1;
  const dest = destinations[activeDest]!;
  const destResult = result.destinations[activeDest]!;

  const nights = nightsBetween(dest.startDate, dest.endDate);
  const allNights = totalNights(destinations);

  const totalActivities = destResult.itinerary.itinerario.reduce(
    (sum, d) => sum + d.actividades.length,
    0,
  );
  const p = destResult.budget.presupuesto;
  const flag = flagForDestination(dest.destination);

  const hasMapPoints = useMemo(
    () =>
      destResult.itinerary.itinerario.some((d) =>
        d.actividades.some((a) => a.lat !== undefined && a.lon !== undefined),
      ),
    [destResult.itinerary],
  );

  const visibleTabs = useMemo<Array<{ key: ContentTab; label: string; emoji: string }>>(() => {
    const base: Array<{ key: ContentTab; label: string; emoji: string }> = [
      { key: "itinerario", label: t("tabs.itinerary"), emoji: "🗺️" },
      { key: "mapa", label: t("tabs.map"), emoji: "📍" },
      { key: "alojamiento", label: t("tabs.accommodation"), emoji: "🏨" },
      { key: "presupuesto", label: t("tabs.budget"), emoji: "💰" },
      { key: "grupo", label: t("tabs.group"), emoji: "👥" },
    ];
    return base.filter((tab) => {
      if (tab.key === "alojamiento") return !!destResult.accommodation;
      if (tab.key === "mapa") return hasMapPoints;
      return true;
    });
  }, [destResult.accommodation, hasMapPoints, t]);

  // When switching destination, reset to itinerario tab
  const handleDestChange = (idx: number) => {
    setActiveDest(idx);
    setTab("itinerario");
  };

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-6 sm:pt-10">
      {/* Hero */}
      <section className="mb-8 sm:mb-10">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions}
          <Button variant="secondary" size="sm" onClick={onReset}>
            {resetLabel ?? t("newTrip")}
          </Button>
        </div>

        {multiDest ? (
          <>
            <h1 className="mt-5 text-[34px] font-bold leading-[1.05] tracking-tight text-fg sm:text-[48px]">
              {destinations.map((d, i) => {
                const f = flagForDestination(d.destination);
                return (
                  <span key={`${d.destination}-${i}`}>
                    {i > 0 && <span className="mx-2 text-muted">·</span>}
                    {d.destination}
                    {f && (
                      <span aria-hidden className="ml-2 text-[28px] sm:text-[40px]">
                        {f}
                      </span>
                    )}
                  </span>
                );
              })}
            </h1>
            <p className="mt-3 text-[15px] text-muted">
              {t("summaryMulti", {
                members: members.length,
                nights: allNights,
                dests: destinations.length,
              })}
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-5 flex flex-wrap items-center gap-4 text-[44px] font-bold leading-[1.05] tracking-tight text-fg sm:text-[64px]">
              <span>{dest.destination}</span>
              {flag && <span aria-hidden className="text-[40px] sm:text-[58px]">{flag}</span>}
            </h1>
            <p className="mt-3 text-[15px] text-muted sm:text-[16px]">
              {formatDateRange(dest.startDate, dest.endDate, locale)} ·{" "}
              {t("summarySingle", { members: members.length, nights })}
            </p>
          </>
        )}
      </section>

      {/* Destination selector (multi-dest only) */}
      {multiDest && (
        <nav className="mb-6 flex gap-2 overflow-x-auto">
          {destinations.map((d, i) => {
            const active = activeDest === i;
            const f = flagForDestination(d.destination);
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleDestChange(i)}
                className={`flex shrink-0 items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-[14px] font-semibold transition-all duration-150 ${
                  active
                    ? "border-rausch bg-rausch/10 text-rausch"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
                }`}
              >
                {f && <span aria-hidden>{f}</span>}
                {d.destination}
                <span className={`text-[11px] font-normal ${active ? "text-rausch/70" : "text-subtle"}`}>
                  {nightsBetween(d.startDate, d.endDate)}n
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* KPIs for active destination */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <KpiCard emoji="💸" label={t("kpis.perPerson")} value={`${Math.round(p.total_persona)}€`} highlight />
        <KpiCard emoji="👥" label={t("kpis.groupTotal")} value={`${Math.round(p.total_grupo)}€`} />
        <KpiCard emoji="🌙" label={t("kpis.nights")} value={String(nights)} />
        <KpiCard emoji="✨" label={t("kpis.activities")} value={String(totalActivities)} />
      </div>

      {/* Budget verdict */}
      <div
        className={`mb-6 flex items-center justify-between gap-3 rounded-2xl px-5 py-3 text-[14px] ${
          p.dentro_presupuesto
            ? "bg-success/10 text-success"
            : "bg-rausch/10 text-rausch"
        }`}
      >
        <span className="font-semibold">
          {p.dentro_presupuesto ? t("verdictUnder") : t("verdictOver")}
        </span>
        <span className="text-muted">
          {t("verdictGoal", { goal: dest.budget, estimated: Math.round(p.total_persona) })}
        </span>
      </div>

      {/* Content tabs */}
      <nav
        role="tablist"
        className="mb-8 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5"
      >
        {visibleTabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-[14px] font-semibold transition-all duration-150 ease-smooth ${
                active
                  ? "bg-fg text-bg shadow-soft"
                  : "text-muted hover:bg-surface-hover hover:text-fg"
              }`}
            >
              <span aria-hidden>{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="animate-slide-up">
        {tab === "itinerario" && <ItineraryView itinerary={destResult.itinerary} />}
        {tab === "mapa" && <MapView itinerary={destResult.itinerary} />}
        {tab === "alojamiento" && destResult.accommodation && (
          <AccommodationView
            accommodation={destResult.accommodation}
            trip={dest}
            members={members}
            bookingUrlBuilder={({ destination, hotelName }) =>
              buildBookingSearchUrl({
                destination,
                checkin: dest.startDate,
                checkout: dest.endDate,
                adults: members.length,
                affiliateId: process.env.NEXT_PUBLIC_BOOKING_AFFILIATE_ID,
                hotelName,
              })
            }
          />
        )}
        {tab === "presupuesto" && (
          <BudgetView budget={destResult.budget} trip={dest} members={members} />
        )}
        {tab === "grupo" && (
          <GroupView consensus={result.consensus} members={members} />
        )}
      </div>
    </div>
  );
}

interface KpiCardProps {
  emoji: string;
  label: string;
  value: string;
  highlight?: boolean;
}

function KpiCard({ emoji, label, value, highlight = false }: KpiCardProps) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-all hover:shadow-soft ${
        highlight ? "border-rausch/30 bg-rausch/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
        <span aria-hidden>{emoji}</span>
        {label}
      </div>
      <div
        className={`mt-2 text-[26px] font-bold leading-none tracking-tight ${
          highlight ? "text-rausch" : "text-fg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
