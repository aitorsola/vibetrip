"use client";

import { useTranslations } from "next-intl";
import type { Budget } from "@/domain/budget";
import type { DestinationSegment, Member } from "@/domain/trip";

interface BudgetViewProps {
  budget: Budget;
  trip: DestinationSegment;
  members: Member[];
}

interface Row {
  label: string;
  value: number;
  emoji: string;
  color: string;
  note?: string;
}

export function BudgetView({ budget, trip, members }: BudgetViewProps) {
  const t = useTranslations("budget");
  const tResults = useTranslations("results");
  const p = budget.presupuesto;

  const breakdown: Row[] = [
    {
      label: t("row.activities"),
      value: p.actividades_total_persona,
      emoji: "✨",
      color: "#E91E63",
      note: t("row.activitiesNote"),
    },
  ];

  const total = breakdown.reduce((s, r) => s + r.value, 0) || 1;
  const diff = Math.round(p.total_persona - trip.budget);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-3xl bg-surface p-6 shadow-soft sm:p-8">
        <header className="mb-6 flex items-baseline justify-between">
          <h2 className="text-[22px] font-bold tracking-tight text-fg">
            {t("breakdownTitle")}
          </h2>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">
            EUR
          </span>
        </header>

        <div className="mb-6 flex h-3 overflow-hidden rounded-full bg-surface-hover">
          {breakdown.map((r) => (
            <div
              key={r.label}
              title={`${r.label}: ${Math.round(r.value)}€`}
              style={{
                width: `${(r.value / total) * 100}%`,
                backgroundColor: r.color,
              }}
            />
          ))}
        </div>

        <ul className="space-y-3">
          {breakdown.map((r) => (
            <li
              key={r.label}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-strong"
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                style={{
                  backgroundColor: `${r.color}15`,
                  color: r.color,
                }}
              >
                {r.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-fg">
                    {r.label}
                  </span>
                  <span className="text-[16px] font-bold tabular-nums text-fg">
                    {Math.round(r.value)}€
                  </span>
                </div>
                {r.note && (
                  <p className="mt-0.5 text-[11px] text-subtle">{r.note}</p>
                )}
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(r.value / total) * 100}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-[12px] text-subtle">{t("notIncluded")}</p>

        <div className="mt-5 flex items-baseline justify-between border-t-2 border-fg pt-5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">
              {t("perPersonTotal")}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {t("groupTotal", {
                count: members.length,
                total: Math.round(p.total_grupo),
              })}
            </p>
          </div>
          <span className="text-[36px] font-bold tracking-tight text-rausch sm:text-[42px]">
            {Math.round(p.total_persona)}€
          </span>
        </div>
      </div>

      <aside>
        <div
          className={`rounded-3xl p-6 ${
            p.dentro_presupuesto ? "bg-success/10" : "bg-rausch/10"
          }`}
        >
          <div
            className={`text-[12px] font-semibold uppercase tracking-wider ${
              p.dentro_presupuesto ? "text-success" : "text-rausch"
            }`}
          >
            {p.dentro_presupuesto ? tResults("verdictUnder") : tResults("verdictOver")}
          </div>
          <h3 className="mt-2 text-[24px] font-bold leading-tight tracking-tight text-fg">
            {diff <= 0
              ? t("marginUnder", { amount: Math.abs(diff) })
              : t("marginOver", { amount: Math.abs(diff) })}
          </h3>
          <p className="mt-2 text-[14px] text-muted">
            {t("verdictHelp", {
              goal: trip.budget,
              estimated: Math.round(p.total_persona),
              count: members.length,
              totalDiff: Math.abs(diff * members.length),
            })}
          </p>
        </div>
      </aside>
    </div>
  );
}
