"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { AgentStatus, DestinationResult } from "@/domain/plan";
import type { Consensus } from "@/domain/consensus";
import { flagForDestination } from "@/domain/countries";
import type { DestinationSegment, Member } from "@/domain/trip";
import { totalNights } from "@/domain/trip";
import { Button } from "@/ui/Button";
import { useLlmConfig } from "@/ui/LlmConfigProvider";
import { AgentCard } from "./AgentCard";
import { DestinationsTitle } from "./DestinationsTitle";
import type {
  DestAgentStatusMap,
  DestToolActivity,
  ToolActivity,
} from "@/hooks/useTripPlanner";

/** Seconds the provider said to wait, encoded by llmErrorCode as a
 *  ":<seconds>" suffix on the limit codes. */
function waitSecondsFrom(error: string): number | null {
  const m = error.match(/model_(?:quota|rate_limited):(\d+)/);
  if (!m?.[1]) return null;
  const secs = parseInt(m[1], 10);
  return Number.isFinite(secs) && secs > 0 ? secs : null;
}

/** Spells the wait out as "1 h 20 min" rather than rounding to whole hours —
 *  a daily quota that clears in 80 minutes shouldn't read as "about 2 h". */
function waitLabel(
  seconds: number,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return t("errorWaitSoon");
  if (mins < 60) return t("errorWaitMinutes", { m: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0
    ? t("errorWaitHours", { h })
    : t("errorWaitHoursMinutes", { h, m });
}

interface GeneratingPageProps {
  destinations: DestinationSegment[];
  members: Member[];
  consensusStatus: AgentStatus;
  destStatuses: DestAgentStatusMap[];
  consensusData: Consensus | null;
  destPartials: Array<Partial<DestinationResult>>;
  destToolActivity: DestToolActivity[];
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
}

export function GeneratingPage({
  destinations,
  members,
  consensusStatus,
  destStatuses,
  consensusData,
  destPartials,
  destToolActivity,
  error,
  onBack,
  onRetry,
}: GeneratingPageProps) {
  const t = useTranslations("generating");
  const { config: byok, clearConfig } = useLlmConfig();
  const waitSeconds = error ? waitSecondsFrom(error) : null;
  const nights = totalNights(destinations);
  const multiDest = destinations.length > 1;

  // Total agent count: 1 consensus + per destination (itinerary + accommodation? + budget)
  const totalAgents = useMemo(
    () =>
      1 + destinations.reduce((sum, d) => sum + (d.includeAccommodation ? 3 : 2), 0),
    [destinations],
  );

  const completedAgents = useMemo(() => {
    let n = consensusStatus === "done" ? 1 : 0;
    for (let i = 0; i < destinations.length; i++) {
      const st = destStatuses[i];
      if (!st) continue;
      if (st.itinerary === "done") n++;
      if (destinations[i]!.includeAccommodation && st.accommodation === "done") n++;
      if (st.budget === "done") n++;
    }
    return n;
  }, [consensusStatus, destinations, destStatuses]);

  const progressPct = Math.round((completedAgents / totalAgents) * 100);

  // When an error occurs, freeze any "running" card as "error" so animations stop.
  const eff = (s: AgentStatus): AgentStatus => (error && s === "running" ? "error" : s);

  const isConsensusRunning = !error && consensusStatus === "running";
  const activeDestIdx = error
    ? -1
    : destinations.findIndex((_, i) => {
        const st = destStatuses[i];
        return (
          st &&
          (st.itinerary === "running" ||
            st.accommodation === "running" ||
            st.budget === "running")
        );
      });
  const activeDestName =
    activeDestIdx >= 0 ? destinations[activeDestIdx]!.destination : null;

  const activeLabel = isConsensusRunning
    ? t("active.consensus")
    : activeDestName
      ? activeDestName
      : completedAgents === totalAgents
        ? null
        : t("active.fallback");

  const summary = multiDest
    ? t("summaryMulti", {
        members: members.length,
        nights,
        dests: destinations.length,
      })
    : `${t("summary", { members: members.length, nights })} · ${t("summarySingleBudget", { budget: destinations[0]?.budget ?? 0 })}`;

  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-6 sm:pt-12">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-rausch">
          {t("header")}
        </p>
        <DestinationsTitle destinations={destinations} />
        <p className="mt-2 text-[14px] text-muted">{summary}</p>
      </div>

      {/* Overall progress bar / error banner */}
      {error ? (
        <div className="mb-8 rounded-3xl border border-rausch/30 bg-rausch/5 p-5">
          <p className="text-[14px] font-semibold text-rausch">{t("errorTitle")}</p>
          <p className="mt-1 text-[13px] text-fg">
            {error.includes("model_unavailable")
              ? t("errorModelUnavailable")
              : error.includes("model_quota")
                ? t("errorQuota")
                : error.includes("model_rate_limited")
                  ? t("errorRateLimited")
                  : // "invalid key" headline only makes sense when the user
                    // actually supplied a key; a default-model 401 is generic.
                    error.includes("byok_invalid_key") && byok
                    ? t("errorInvalidKey")
                    : t("errorGeneric")}
          </p>
          {waitSeconds !== null ? (
            <p className="mt-1 text-[13px] font-semibold text-fg">
              {waitLabel(waitSeconds, t)}
            </p>
          ) : null}
          <p className="mt-1 text-[13px] text-muted">
            {byok ? t("byokHint") : t("defaultHint")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
            {byok ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  // Drop the BYOK key, then retry on the default model.
                  clearConfig();
                  onRetry();
                }}
              >
                {t("useDefaultModel")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onBack}>
              {t("back")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-3xl bg-surface p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeLabel !== null ? (
                <>
                  <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-rausch opacity-60" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-rausch" />
                  </div>
                  <span className="text-[14px] font-semibold text-fg">{activeLabel}</span>
                </>
              ) : (
                <span className="text-[14px] font-semibold text-success">
                  {t("completed")}
                </span>
              )}
            </div>
            <span className="font-mono text-[12px] font-semibold text-muted">
              {completedAgents}/{totalAgents}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full rounded-full bg-rausch transition-[width] duration-700 ease-smooth"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Consensus card */}
      <div className="mb-5 space-y-3">
        <AgentCard
          index={0}
          emoji="🤝"
          title={t("consensusCardTitle")}
          description={t("consensusCardDescription")}
          accent="#7C4DFF"
          status={eff(consensusStatus)}
          preview={
            consensusData ? (
              <div className="space-y-2">
                {consensusData.consenso.intereses_comunes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {consensusData.consenso.intereses_comunes.slice(0, 6).map((i) => (
                      <span
                        key={i}
                        className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-fg"
                      >
                        {i}
                      </span>
                    ))}
                  </div>
                )}
                <p className="line-clamp-3 text-[13px] italic text-fg">
                  «{consensusData.consenso.recomendacion}»
                </p>
              </div>
            ) : null
          }
        />
      </div>

      {/* Per-destination agent stacks */}
      {destinations.map((dest, destIdx) => {
        const st = destStatuses[destIdx] ?? INITIAL_DEST_STATUS;
        const partial = destPartials[destIdx] ?? {};
        const toolActivity = destToolActivity[destIdx] ?? {};
        const flag = flagForDestination(dest.destination);

        // Card numbering is global (01 consensus, 02 itinerary D1, 03
        // accommodation D1, 04 budget D1, 05 itinerary D2…). Compute the
        // base offset for this destination from the previous ones.
        const previousCards = destinations
          .slice(0, destIdx)
          .reduce((sum, d) => sum + (d.includeAccommodation ? 3 : 2), 0);
        const itineraryIdx = 1 + previousCards;
        const accommodationIdx = itineraryIdx + 1;
        const budgetIdx = dest.includeAccommodation
          ? accommodationIdx + 1
          : itineraryIdx + 1;

        const itineraryDescription =
          st.itinerary === "running"
            ? toolActivity.itinerary
              ? formatToolActivity(toolActivity.itinerary, t)
              : t("itineraryDescriptionRunningEmpty")
            : t("itineraryDescriptionIdle");

        const accommodationDescription =
          st.accommodation === "running"
            ? toolActivity.accommodation
              ? formatToolActivity(toolActivity.accommodation, t)
              : t("accommodationDescriptionRunningEmpty")
            : t("accommodationDescriptionIdle");

        return (
          <div key={`${dest.destination}-${destIdx}`} className="mb-6">
            {multiDest && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[13px] font-bold text-fg">{dest.destination}</span>
                {flag && (
                  <span aria-hidden className="text-[16px]">
                    {flag}
                  </span>
                )}
                <span className="text-[12px] text-muted">
                  · {dest.startDate} → {dest.endDate} · {dest.budget}€/persona
                </span>
              </div>
            )}
            <div className="space-y-3">
              <AgentCard
                index={itineraryIdx}
                emoji="🗺️"
                title={t("itineraryCardTitle")}
                description={itineraryDescription}
                accent="#FF6B35"
                status={eff(st.itinerary)}
                preview={
                  partial.itinerary ? (
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                        {t("previewDays", {
                          days: partial.itinerary.itinerario.length,
                          acts: partial.itinerary.itinerario.reduce(
                            (s, d) => s + d.actividades.length,
                            0,
                          ),
                        })}
                      </div>
                      <ul className="space-y-1.5">
                        {partial.itinerary.itinerario.slice(0, 3).map((d) => (
                          <li
                            key={d.dia}
                            className="flex items-center gap-2 text-[13px] text-fg"
                          >
                            <span className="font-mono text-[11px] text-subtle">
                              D{d.dia}
                            </span>
                            <span className="truncate">{d.titulo}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null
                }
              />
              {dest.includeAccommodation && (
                <AgentCard
                  index={accommodationIdx}
                  emoji="🏨"
                  title={t("accommodationCardTitle")}
                  description={accommodationDescription}
                  accent="#00A86B"
                  status={eff(st.accommodation)}
                  preview={
                    partial.accommodation ? (
                      <ul className="space-y-1.5">
                        {partial.accommodation.opciones.slice(0, 3).map((op, i) => (
                          <li
                            key={`${op.tipo}-${i}`}
                            className="flex items-center justify-between text-[13px]"
                          >
                            <span className="truncate text-fg">{op.tipo}</span>
                            <span className="ml-3 shrink-0 truncate text-muted">
                              {op.zona}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null
                  }
                />
              )}
              <AgentCard
                index={budgetIdx}
                emoji="💰"
                title={t("budgetCardTitle")}
                description={t("budgetCardDescription")}
                accent="#00AC00"
                status={eff(st.budget)}
                preview={
                  partial.budget ? (
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] text-fg">{t("budgetTotalEstimated")}</span>
                      <span className="text-[20px] font-bold text-rausch">
                        {Math.round(partial.budget.presupuesto.total_persona)}€
                        <span className="ml-1 text-[12px] font-normal text-muted">
                          {t("perPersonShort")}
                        </span>
                      </span>
                    </div>
                  ) : null
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const INITIAL_DEST_STATUS: DestAgentStatusMap = {
  itinerary: "pending",
  accommodation: "pending",
  budget: "pending",
};

function formatToolActivity(
  a: ToolActivity,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (a.tool === "search_places") {
    const i = a.input as { query?: string; city?: string } | null;
    const query = i?.query ?? "?";
    const city = i?.city ?? "";
    return t("searchProgress", { n: a.count, query, city: city || "empty" });
  }
  return t("callingTool", { tool: a.tool });
}
