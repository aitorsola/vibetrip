"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { Activity, ActivityType } from "@/domain/itinerary";

// Leaflet pulls in `window`, so its components must be SSR-disabled.
const ActivityMiniMap = dynamic(() => import("./ActivityMiniMap.client"), {
  ssr: false,
  loading: () => (
    <div className="h-44 w-full animate-pulse rounded-2xl bg-surface-hover" />
  ),
});

const TYPE_META: Record<ActivityType, { emoji: string; color: string }> = {
  cultura: { emoji: "🏛️", color: "#7C4DFF" },
  comida: { emoji: "🍽️", color: "#FF6B35" },
  naturaleza: { emoji: "🌿", color: "#00B8D9" },
  ocio: { emoji: "🎉", color: "#E91E63" },
  transporte: { emoji: "🚆", color: "#5C6F7E" },
};

interface ActivityDetailModalProps {
  activity: Activity;
  onClose: () => void;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function externalUrl(activity: Activity): string | null {
  for (const raw of [activity.web, activity.reserva]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    } catch {
      /* not a valid URL — skip */
    }
  }
  return null;
}

function directionsUrl(activity: Activity): string {
  if (activity.lat !== undefined && activity.lon !== undefined) {
    return `https://www.google.com/maps/dir/?api=1&destination=${activity.lat},${activity.lon}&travelmode=walking`;
  }
  const query = encodeURIComponent(
    `${activity.nombre} ${activity.direccion}`.trim(),
  );
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function ActivityDetailModal({
  activity,
  onClose,
}: ActivityDetailModalProps) {
  const t = useTranslations("itinerary");
  const meta = TYPE_META[activity.tipo];
  const slotLabel = activity.bloque ? t(`slot.${activity.bloque}`) : null;
  const typeLabel = t(`type.${activity.tipo}`);
  const link = useMemo(() => externalUrl(activity), [activity]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [shareNotice, setShareNotice] = useState<"idle" | "copied">("idle");

  // Close on Escape and lock body scroll while the dialog is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function handleShare() {
    const lines = [
      `📍 ${activity.nombre}`,
      activity.direccion,
      activity.duracion_min > 0
        ? `⏱ ${activity.hora} · ${formatDuration(activity.duracion_min)}`
        : `⏱ ${activity.hora}`,
      activity.descripcion,
    ].filter(Boolean);
    const text = lines.join("\n");

    // navigator.share is the right primitive on mobile and modern Macs;
    // fall back to clipboard on browsers that don't expose it.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: activity.nombre, text });
        return;
      } catch {
        /* user dismissed or browser refused — fall through to clipboard */
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setShareNotice("copied");
        setTimeout(() => setShareNotice("idle"), 2400);
      } catch {
        /* ignored — last-resort no-op */
      }
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg shadow-soft outline-none sm:max-w-2xl sm:rounded-3xl"
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("detail.close")}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/95 text-[16px] text-muted shadow-soft transition hover:text-fg"
        >
          ✕
        </button>

        <div className="space-y-6 p-6 sm:p-8">
          {/* Header */}
          <header className="space-y-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}
            >
              <span aria-hidden>{meta.emoji}</span>
              {typeLabel}
            </span>
            <h2
              id="activity-detail-title"
              className="text-[26px] font-bold leading-tight tracking-tight text-fg sm:text-[32px]"
            >
              {activity.nombre}
            </h2>
            <div className="flex items-center justify-between text-[14px] text-muted">
              <div className="flex items-center gap-2">
                <span aria-hidden>🕒</span>
                {slotLabel ? (
                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                    {slotLabel} ·
                  </span>
                ) : null}
                <span className="font-semibold tabular-nums text-fg">
                  {activity.hora}
                </span>
                {activity.duracion_min > 0 ? (
                  <span className="text-muted">
                    · {formatDuration(activity.duracion_min)}
                  </span>
                ) : null}
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums ${
                  activity.coste_persona > 0
                    ? "bg-rausch/10 text-rausch"
                    : "bg-success/10 text-success"
                }`}
              >
                {activity.coste_persona > 0
                  ? `${activity.coste_persona}€`
                  : t("free")}
              </span>
            </div>
          </header>

          {/* Description */}
          {activity.descripcion ? (
            <p className="text-[15px] leading-relaxed text-fg">
              {activity.descripcion}
            </p>
          ) : null}

          {/* Mini map */}
          {activity.lat !== undefined && activity.lon !== undefined ? (
            <ActivityMiniMap
              lat={activity.lat}
              lon={activity.lon}
              color={meta.color}
              name={activity.nombre}
            />
          ) : null}

          {/* Info rows */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {activity.direccion ? (
              <InfoRow icon="📍" text={activity.direccion} />
            ) : null}
            {activity.transporte ? (
              <InfoRow icon="🚇" text={activity.transporte} />
            ) : null}
            {activity.tip ? (
              <InfoRow icon="💡" text={activity.tip} italic />
            ) : null}
            {activity.alternativa_lluvia ? (
              <InfoRow
                icon="🌧️"
                text={`${t("ifRains")} ${activity.alternativa_lluvia}`}
              />
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href={directionsUrl(activity)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rausch px-5 py-3 text-[15px] font-bold text-white transition hover:bg-rausch/90"
            >
              <span aria-hidden>🧭</span>
              {t("detail.howToGet")}
            </a>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3 text-[15px] font-semibold text-fg transition hover:border-fg"
              >
                <span aria-hidden>🌐</span>
                {t("detail.openWeb")}
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-5 py-3 text-[15px] font-semibold text-fg transition hover:border-fg"
            >
              <span aria-hidden>🔗</span>
              {shareNotice === "copied"
                ? t("detail.copied")
                : t("detail.share")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  text,
  italic = false,
}: {
  icon: string;
  text: string;
  italic?: boolean;
}) {
  return (
    <div className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      <p
        className={`text-[14px] leading-relaxed text-fg ${
          italic ? "italic" : ""
        }`}
      >
        {text}
      </p>
    </div>
  );
}
