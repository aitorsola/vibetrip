"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { DESTINATION_SUGGESTIONS } from "@/constants/catalog";
import type { DestinationSegment } from "@/domain/trip";
import { Chip } from "@/ui/Chip";
import { DateField } from "@/ui/DateField";
import { Field, inputClass } from "@/ui/Field";

interface TripDetailsFormProps {
  trip: DestinationSegment;
  onChange: (next: DestinationSegment) => void;
  nights: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TripDetailsForm({
  trip,
  onChange,
  nights,
}: TripDetailsFormProps) {
  const t = useTranslations("createTrip.form");
  const update = <K extends keyof DestinationSegment>(
    key: K,
    value: DestinationSegment[K],
  ) => onChange({ ...trip, [key]: value });

  // For same-day trips there's no overnight stay, so force-disable
  // accommodation regardless of what the user toggled before changing dates.
  useEffect(() => {
    if (nights === 0 && trip.includeAccommodation) {
      onChange({ ...trip, includeAccommodation: false });
    }
  }, [nights, trip, onChange]);

  const handleStartChange = (next: string) => {
    if (!next) {
      onChange({ ...trip, startDate: "" });
      return;
    }
    // If the existing endDate is before the new startDate (or empty),
    // bump it so the picker for "Vuelta" anchors on a sensible day.
    const needsBump = !trip.endDate || trip.endDate < next;
    onChange({
      ...trip,
      startDate: next,
      endDate: needsBump ? addDaysIso(next, 3) : trip.endDate,
    });
  };

  const handleEndChange = (next: string) => {
    if (next && trip.startDate && next < trip.startDate) {
      // Clamp end-before-start to the start
      onChange({ ...trip, endDate: trip.startDate });
      return;
    }
    update("endDate", next);
  };

  const today = todayIso();
  const minEnd = trip.startDate || today;

  return (
    <div className="min-w-0 space-y-6">
      <Field label={t("destinationLabel")} htmlFor="destination">
        <input
          id="destination"
          type="text"
          placeholder={t("destinationPlaceholder")}
          value={trip.destination}
          onChange={(e) => update("destination", e.target.value)}
          className={inputClass}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {DESTINATION_SUGGESTIONS.slice(0, 8).map((d) => (
            <Chip
              key={d}
              size="sm"
              active={trip.destination === d}
              onClick={() => update("destination", d)}
            >
              {d}
            </Chip>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3 [&>*]:min-w-0">
        <Field label={t("startLabel")} htmlFor="start">
          <DateField
            id="start"
            value={trip.startDate}
            min={today}
            onChange={handleStartChange}
          />
        </Field>
        <Field label={t("endLabel")} htmlFor="end">
          <DateField
            id="end"
            value={trip.endDate}
            min={minEnd}
            onChange={handleEndChange}
            disabled={!trip.startDate}
          />
        </Field>
        <Field label={t("budgetLabel")} htmlFor="budget">
          <div className="relative min-w-0">
            <input
              id="budget"
              type="number"
              min={100}
              step={50}
              value={trip.budget}
              onChange={(e) =>
                update("budget", Number.parseInt(e.target.value) || 0)
              }
              className={`${inputClass} pr-12`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[14px] font-semibold text-muted">
              €
            </span>
          </div>
        </Field>
      </div>

      {/* Accommodation toggle — hidden for same-day trips (no overnight stay) */}
      {nights > 0 ? (
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
            trip.includeAccommodation
              ? "border-rausch/40 bg-rausch/5"
              : "border-border bg-surface-hover"
          }`}
        >
          <input
            type="checkbox"
            checked={trip.includeAccommodation}
            onChange={(e) => update("includeAccommodation", e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-rausch"
          />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-fg">
              {t("accommodationTitle")}
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
              {t("accommodationBody")}
            </p>
          </div>
        </label>
      ) : null}

      {trip.startDate && trip.endDate ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface-hover px-4 py-3 text-[14px] text-muted">
          <span aria-hidden>📅</span>
          <span>
            <strong className="text-fg">
              {nights === 0
                ? t("summaryDayTrip")
                : t("summaryNights", { nights })}
            </strong>{" "}
            · {t("summarySuffix", { budget: trip.budget })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
