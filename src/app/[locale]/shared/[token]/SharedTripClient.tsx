"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { ResultsPage } from "@/features/results/ResultsPage";
import { Button } from "@/ui/Button";
import type { PlanResult } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";
import { saveSharedTripAction } from "./actions";

interface SharedTripClientProps {
  token: string;
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
  isLoggedIn: boolean;
}

export function SharedTripClient({
  token,
  destinations,
  members,
  result,
  isLoggedIn,
}: SharedTripClientProps) {
  const tResults = useTranslations("results");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    setError(null);
    if (!isLoggedIn) {
      // Bounce through login, returning to this page after the magic
      // link completes. Encode the current URL so the next-intl router
      // preserves it.
      router.push(
        `/login?next=${encodeURIComponent(`/shared/${token}`)}` as never,
      );
      return;
    }
    startTransition(async () => {
      const res = await saveSharedTripAction(token);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.push(`/trips/${res.id}` as never);
    });
  };

  return (
    <div>
      <div className="mx-auto max-w-3xl px-6 pt-6">
        <SharedBanner
          isLoggedIn={isLoggedIn}
          pending={pending}
          error={error}
          onSave={onSave}
        />
      </div>

      <ResultsPage
        destinations={destinations}
        members={members}
        result={result}
        onReset={() => router.push("/" as never)}
        resetLabel={tResults("goHome")}
      />
    </div>
  );
}

interface SharedBannerProps {
  isLoggedIn: boolean;
  pending: boolean;
  error: string | null;
  onSave: () => void;
}

function SharedBanner({
  isLoggedIn,
  pending,
  error,
  onSave,
}: SharedBannerProps) {
  const t = useTranslations("share");

  return (
    <div className="mb-6 rounded-3xl border border-border bg-surface px-5 py-4 shadow-soft sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-rausch">
          <span aria-hidden>🔗</span>
          {t("publicBanner.label")}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">
          {isLoggedIn ? t("publicBanner.bodyAuthed") : t("publicBanner.bodyAnon")}
        </p>
        {error && (
          <p className="mt-2 text-[13px] text-rausch">{error}</p>
        )}
      </div>

      <Button
        onClick={onSave}
        disabled={pending}
        className="mt-3 w-full sm:mt-0 sm:w-auto sm:shrink-0"
      >
        {pending
          ? t("saving")
          : isLoggedIn
            ? t("saveCta")
            : t("loginToSaveCta")}
      </Button>
    </div>
  );
}
