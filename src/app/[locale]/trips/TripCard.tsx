"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/routing";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { flagForDestination } from "@/domain/countries";
import type { DestinationSegment } from "@/domain/trip";
import { deleteTrip } from "./actions";

interface TripCardProps {
  id: string;
  createdAt: string;
  destinations: DestinationSegment[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
  /** True while a bulk delete is in flight; disables the row. */
  busy?: boolean;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateRange(start: string, end: string, locale: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
  return `${fmt(start)} → ${fmt(end)}`;
}

export function TripCard({
  id,
  createdAt,
  destinations,
  selected,
  onToggleSelect,
  busy = false,
}: TripCardProps) {
  const t = useTranslations("trips");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const first = destinations[0];
  const last = destinations[destinations.length - 1];
  const multi = destinations.length > 1;

  const dimmed = busy || pending;

  const onConfirm = () => {
    setError(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const res = await deleteTrip(id);
      if ("error" in res) setError(res.error);
    });
  };

  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`relative rounded-3xl border bg-surface transition-all ${
        selected
          ? "border-rausch shadow-soft"
          : "border-border"
      } ${
        dimmed
          ? "opacity-50"
          : "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-soft"
      }`}
    >
      <Link
        href={`/trips/${id}` as never}
        className="block p-5 pl-14 pr-16"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-[18px] font-bold leading-tight text-fg">
              {destinations.map((d, i) => {
                const f = flagForDestination(d.destination);
                return (
                  <span
                    key={`${d.destination}-${i}`}
                    className="inline-flex items-center gap-2"
                  >
                    {i > 0 && <span className="text-muted">·</span>}
                    {f && <span aria-hidden>{f}</span>}
                    <span>{d.destination}</span>
                  </span>
                );
              })}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {first && last
                ? formatDateRange(first.startDate, last.endDate, locale)
                : "—"}
              {multi && ` · ${destinations.length}`}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-hover px-3 py-1 text-[11px] font-semibold text-muted">
            {formatDate(createdAt, locale)}
          </span>
        </div>
        <span className="mt-3 inline-block text-[12px] font-semibold text-rausch">
          {t("viewPlan")}
        </span>
      </Link>

      {/* Checkbox (left edge) */}
      <label
        onClick={stopPropagation}
        className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full hover:bg-surface-hover"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(id)}
          disabled={dimmed}
          aria-label={
            selected ? t("deselectAll") : t("deleteAria")
          }
          className="h-5 w-5 cursor-pointer accent-rausch"
        />
      </label>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={dimmed}
        aria-label={t("deleteAria")}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-muted transition-all hover:border-border-strong hover:bg-surface-hover hover:text-rausch active:scale-95 disabled:opacity-40"
      >
        <TrashIcon />
      </button>

      {error ? (
        <p className="mx-5 mb-4 rounded-lg bg-rausch/10 px-3 py-2 text-[12px] text-rausch">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={t("deleteSingleTitle")}
        description={t("deleteSingleBody")}
        confirmLabel={t("deleteSingleConfirm")}
        cancelLabel={tCommon("cancel")}
        variant="danger"
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
    </svg>
  );
}
