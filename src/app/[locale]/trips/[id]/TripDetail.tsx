"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { ResultsPage } from "@/features/results/ResultsPage";
import { Button } from "@/ui/Button";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import type { PlanResult } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";
import { revokeShareAction, shareTripAction } from "../actions";

interface TripDetailProps {
  id: string;
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
  /** Existing share token for the trip, if it already had one. */
  initialShareToken: string | null;
}

export function TripDetail({
  id,
  destinations,
  members,
  result,
  initialShareToken,
}: TripDetailProps) {
  const t = useTranslations("share");
  const tResults = useTranslations("results");
  const locale = useLocale();
  const router = useRouter();
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [shareError, setShareError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const shareURL = (() => {
    if (!shareToken) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/${locale}/shared/${shareToken}`;
  })();

  const onShare = () => {
    setShareError(null);
    startTransition(async () => {
      const res = await shareTripAction(id);
      if ("error" in res) {
        setShareError(res.error);
        return;
      }
      setShareToken(res.token);
      const url = `${window.location.origin}/${locale}/shared/${res.token}`;

      // Prefer the OS share sheet (mobile Safari, iOS PWAs) for the
      // best UX; fall back to the clipboard on desktop browsers.
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function"
        ) {
          await navigator.share({ url, title: t("subject") });
          return;
        }
        await navigator.clipboard?.writeText(url);
        setShareError(t("copied"));
        setTimeout(() => setShareError(null), 2500);
      } catch {
        // User dismissed the share sheet — silent.
      }
    });
  };

  const onRevoke = () => {
    setConfirmRevoke(false);
    startTransition(async () => {
      const res = await revokeShareAction(id);
      if ("error" in res) {
        setShareError(res.error);
        return;
      }
      setShareToken(null);
    });
  };

  return (
    <div>
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <ShareControls
          shareURL={shareURL}
          pending={pending}
          error={shareError}
          onShare={onShare}
          onRequestRevoke={() => setConfirmRevoke(true)}
        />
      </div>

      <ResultsPage
        destinations={destinations}
        members={members}
        result={result}
        onReset={() => router.push("/trips")}
        resetLabel={tResults("backToTrips")}
        actions={<ChatAboutTripCta tripId={id} />}
      />

      <ConfirmDialog
        open={confirmRevoke}
        title={t("revokeTitle")}
        description={t("revokeBody")}
        confirmLabel={t("revokeConfirm")}
        cancelLabel={t("revokeCancel")}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={onRevoke}
      />
    </div>
  );
}

interface ShareControlsProps {
  shareURL: string | null;
  pending: boolean;
  error: string | null;
  onShare: () => void;
  onRequestRevoke: () => void;
}

function ShareControls({
  shareURL,
  pending,
  error,
  onShare,
  onRequestRevoke,
}: ShareControlsProps) {
  const t = useTranslations("share");

  return (
    <div className="mb-6 rounded-3xl border border-border bg-surface px-5 py-4 shadow-soft">
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-rausch">
            <span aria-hidden>🔗</span>
            {t("ownerBanner.label")}
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            {shareURL ? t("ownerBanner.bodyShared") : t("ownerBanner.bodyIdle")}
          </p>
          {shareURL && (
            <p className="mt-2 break-all rounded-xl bg-surface-hover px-3 py-2 font-mono text-[12px] text-fg">
              {shareURL}
            </p>
          )}
          {error && (
            <p className="mt-2 text-[13px] text-rausch">{error}</p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:shrink-0">
          <Button onClick={onShare} disabled={pending}>
            {pending ? t("working") : shareURL ? t("shareAgain") : t("share")}
          </Button>
          {shareURL && (
            <Button
              variant="secondary"
              onClick={onRequestRevoke}
              disabled={pending}
            >
              {t("revoke")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * CTA that opens a brand-new chat scoped to this trip. The /chat page reads
 * the `trip` query param, validates ownership server-side, and binds the
 * resulting session to it on the first message sent.
 */
function ChatAboutTripCta({ tripId }: { tripId: string }) {
  const t = useTranslations("chat");
  return (
    <Link
      href={`/chat?trip=${tripId}` as never}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-[13px] font-semibold text-fg transition-all hover:border-fg hover:bg-surface-hover"
    >
      <span aria-hidden>💬</span>
      {t("askAboutTrip")}
    </Link>
  );
}
