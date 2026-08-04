"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import type { DestinationSegment, Member } from "@/domain/trip";
import { nightsBetween, totalDays, MAX_DEFAULT_MODEL_DAYS } from "@/domain/trip";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { SectionHeader } from "@/ui/SectionHeader";
import { useTripResult } from "@/ui/TripResultProvider";
import { useLlmConfig } from "@/ui/LlmConfigProvider";
import { MemberForm } from "./MemberForm";
import { MemberList } from "./MemberList";
import { getRandomSample } from "./sampleData";
import { TripDetailsForm } from "./TripDetailsForm";

interface CreateTripPageProps {
  initialDestinations?: DestinationSegment[];
  initialMembers?: Member[];
  onLaunch: (destinations: DestinationSegment[], members: Member[]) => void;
  error?: string | null;
  mode?: "authed" | "guest-fresh" | "guest-used";
}

const DEFAULT_DESTINATION: DestinationSegment = {
  destination: "",
  startDate: "",
  endDate: "",
  budget: 500,
  includeAccommodation: true,
};

const MAX_DESTINATIONS = 5;

export function CreateTripPage({
  initialDestinations = [{ ...DEFAULT_DESTINATION }],
  initialMembers = [],
  onLaunch,
  error,
  mode = "authed",
}: CreateTripPageProps) {
  const t = useTranslations("createTrip");
  const tHome = useTranslations("home");
  const [destinations, setDestinations] = useState<DestinationSegment[]>(initialDestinations);
  const [members, setMembers] = useState<Member[]>(initialMembers);

  const updateDestination = (index: number, next: DestinationSegment) => {
    setDestinations((prev) => prev.map((d, i) => (i === index ? next : d)));
  };

  const addDestination = () => {
    if (destinations.length >= MAX_DESTINATIONS) return;
    setDestinations((prev) => [...prev, { ...DEFAULT_DESTINATION }]);
  };

  const removeDestination = (index: number) => {
    setDestinations((prev) => prev.filter((_, i) => i !== index));
  };

  const { config: byok } = useLlmConfig();

  const canLaunch =
    destinations.every(
      (d) => d.destination !== "" && d.startDate !== "" && d.endDate !== "",
    ) && members.length >= 1;

  // Default model is capped to short trips. Longer ones need the user's key.
  const days = totalDays(destinations);
  const tooLongForDefault =
    !byok && Number.isFinite(days) && days > MAX_DEFAULT_MODEL_DAYS;

  const fillSample = () => {
    const sample = getRandomSample();
    setDestinations(sample.destinations);
    setMembers(sample.members);
  };

  const { registerFillSample } = useTripResult();
  useEffect(() => {
    registerFillSample(fillSample);
    return () => registerFillSample(null);
  }, [registerFillSample]);

  const isGuest = mode !== "authed";
  const guestUsed = mode === "guest-used";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-12 sm:px-6 sm:pt-16">
      {/* Hero */}
      <section className="mb-8 text-center sm:mb-12">
        <h1 className="mt-5 text-[40px] font-bold leading-[1.05] tracking-tight text-fg sm:text-[56px]">
          {tHome("title.line1")}
          <br />
          <span className="text-rausch">{tHome("title.accent")}</span>.
        </h1>
      </section>

      {isGuest ? (
        <div
          className={`mb-6 rounded-2xl border px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4 ${
            guestUsed
              ? "border-rausch/30 bg-rausch/5"
              : "border-border bg-surface"
          }`}
        >
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-fg">
              {guestUsed
                ? tHome("guestUsedTitle")
                : tHome("guestFreshTitle")}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {guestUsed
                ? tHome("guestUsedBody")
                : tHome("guestFreshBody")}
            </p>
          </div>
          <Link
            href="/login"
            className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-rausch px-5 text-[13px] font-semibold text-white transition-all hover:bg-rausch-dark sm:mt-0 sm:shrink-0"
          >
            {guestUsed ? tHome("guestUsedCta") : tHome("guestFreshCta")}
            <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}

      {/* Step 1 — destinations */}
      <Card className="mb-6" padding="lg">
        <SectionHeader
          step={1}
          title={t("step1Title")}
          subtitle={t("step1Subtitle")}
          action={
            destinations.length < MAX_DESTINATIONS ? (
              <button
                type="button"
                onClick={addDestination}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1 text-[12px] font-semibold text-muted transition-all hover:border-fg hover:text-fg"
              >
                <span aria-hidden className="text-[14px] leading-none">+</span>
                {t("addDestination")}
              </button>
            ) : (
              <span className="rounded-full bg-surface-hover px-3 py-1 text-[12px] font-semibold text-muted">
                {t("maxDestinations", { max: MAX_DESTINATIONS })}
              </span>
            )
          }
        />

        <div className="space-y-6">
          {destinations.map((dest, idx) => (
            <DestinationBlock
              key={idx}
              index={idx}
              total={destinations.length}
              destination={dest}
              onChange={(next) => updateDestination(idx, next)}
              onRemove={destinations.length > 1 ? () => removeDestination(idx) : undefined}
            />
          ))}
        </div>
      </Card>

      {/* Sits right under the dates that trigger it — at the bottom of the
          form the user only found out after filling everything in. */}
      {tooLongForDefault ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-rausch/40 bg-rausch/5 px-5 py-4"
        >
          <p className="text-[14px] font-semibold text-rausch">
            {t("dayLimitTitle")}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {t("dayLimitBody")}
          </p>
        </div>
      ) : null}

      {/* Step 2 — group */}
      <Card className="mb-6" padding="lg">
        <SectionHeader
          step={2}
          title={t("step2Title")}
          subtitle={t("step2Subtitle")}
          action={
            <span className="rounded-full bg-surface-hover px-3 py-1 text-[12px] font-semibold text-muted">
              {t("membersCount", { count: members.length })}
            </span>
          }
        />

        {members.length > 0 ? (
          <div className="mb-5">
            <MemberList
              members={members}
              onRemove={(id) =>
                setMembers((prev) => prev.filter((m) => m.id !== id))
              }
            />
          </div>
        ) : null}

        <MemberForm onAdd={(m) => setMembers((prev) => [...prev, m])} />
      </Card>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-rausch/30 bg-rausch/5 px-4 py-3 text-[14px] text-rausch"
        >
          {error}
        </div>
      ) : null}

      {/* CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-6 py-4 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-4">
          {guestUsed ? (
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rausch px-6 text-[15px] font-semibold text-white transition-all hover:bg-rausch-dark sm:w-auto"
            >
              {tHome("registerToPlan")}
              <span aria-hidden>→</span>
            </Link>
          ) : (
            <Button
              size="lg"
              disabled={!canLaunch || tooLongForDefault}
              onClick={() => onLaunch(destinations, members)}
              className="w-full sm:w-auto"
            >
              {canLaunch
                ? members.length === 1
                  ? t("ctaPlanSolo")
                  : t("ctaPlanGroup")
                : t("ctaIncomplete")}
              <span aria-hidden>→</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface DestinationBlockProps {
  index: number;
  total: number;
  destination: DestinationSegment;
  onChange: (next: DestinationSegment) => void;
  onRemove?: () => void;
}

function DestinationBlock({ index, total, destination, onChange, onRemove }: DestinationBlockProps) {
  const t = useTranslations("createTrip");
  const nights = useMemo(() => {
    if (!destination.startDate || !destination.endDate) return 0;
    return nightsBetween(destination.startDate, destination.endDate);
  }, [destination.startDate, destination.endDate]);

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-surface-hover p-4 sm:p-5">
      {total > 1 && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-wider text-rausch">
            {t("destinationLabel", { n: index + 1 })}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-muted transition-all hover:border-rausch hover:text-rausch"
              aria-label={t("removeDestinationAria", { n: index + 1 })}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      )}
      <TripDetailsForm trip={destination} onChange={onChange} nights={nights} />
    </div>
  );
}
