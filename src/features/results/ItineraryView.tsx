"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Activity, ActivityType, Itinerary } from "@/domain/itinerary";
import { ActivityDetailModal } from "./ActivityDetailModal.client";

const TYPE_META: Record<ActivityType, { emoji: string; color: string }> = {
  cultura: { emoji: "🏛️", color: "#7C4DFF" },
  comida: { emoji: "🍽️", color: "#FF6B35" },
  naturaleza: { emoji: "🌿", color: "#00B8D9" },
  ocio: { emoji: "🎉", color: "#E91E63" },
  transporte: { emoji: "🚆", color: "#5C6F7E" },
};

interface ItineraryViewProps {
  itinerary: Itinerary;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function ItineraryView({ itinerary }: ItineraryViewProps) {
  const t = useTranslations("itinerary");
  const days = itinerary.itinerario;
  const [activeDay, setActiveDay] = useState(0);
  const [selected, setSelected] = useState<Activity | null>(null);
  const day = days[activeDay];
  if (!day) return null;

  return (
    <div>
      {/* Day picker */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {days.map((d, i) => {
          const active = activeDay === i;
          return (
            <button
              key={d.dia}
              onClick={() => setActiveDay(i)}
              className={`flex shrink-0 flex-col items-center justify-center rounded-2xl border px-5 py-3 transition-all duration-150 ease-smooth ${
                active
                  ? "border-fg bg-fg text-bg shadow-soft"
                  : "border-border bg-surface text-fg hover:border-fg hover:bg-surface-hover"
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  active ? "text-bg/70" : "text-muted"
                }`}
              >
                {t("day")}
              </span>
              <span className="text-[20px] font-bold leading-none">
                {String(d.dia).padStart(2, "0")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Day header */}
      <header className="mb-6 rounded-3xl bg-surface p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
          <span aria-hidden>📍</span>
          {day.zona}
        </div>
        <h2 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[34px]">
          {day.titulo}
        </h2>
        {day.resumen ? (
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {day.resumen}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] text-muted">
          {t("summary", {
            days: 1,
            acts: day.actividades.length,
            cost: day.actividades.reduce((s, a) => s + a.coste_persona, 0),
          })}
        </p>
      </header>

      {/* Timeline */}
      <ol className="space-y-3">
        {day.actividades.map((act, i) => (
          <li key={`${act.hora}-${i}`}>
            <button
              type="button"
              onClick={() => setSelected(act)}
              className="block w-full rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rausch"
              aria-label={t("detail.openFor", { name: act.nombre })}
            >
              <ActivityCard activity={act} />
            </button>
          </li>
        ))}
      </ol>

      {selected ? (
        <ActivityDetailModal
          activity={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function ActivityCard({ activity: act }: { activity: Activity }) {
  const t = useTranslations("itinerary");
  const meta = TYPE_META[act.tipo];
  const slotLabel = act.bloque ? t(`slot.${act.bloque}`) : null;
  const typeLabel = t(`type.${act.tipo}`);

  return (
    <article className="group flex gap-4 rounded-3xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-soft sm:gap-6 sm:p-6">
      {/* Time + emoji */}
      <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 text-center sm:w-[92px]">
        {slotLabel ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {slotLabel}
          </span>
        ) : null}
        <div className="text-[18px] font-bold tabular-nums text-fg sm:text-[22px]">
          {act.hora}
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-[22px]"
          style={{
            backgroundColor: `${meta.color}15`,
            color: meta.color,
          }}
        >
          {meta.emoji}
        </div>
        {act.duracion_min > 0 ? (
          <div className="text-[11px] font-semibold text-muted">
            {formatDuration(act.duracion_min)}
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: `${meta.color}15`,
                color: meta.color,
              }}
            >
              {typeLabel}
            </span>
            <h3 className="mt-1.5 text-[18px] font-bold leading-tight text-fg sm:text-[20px]">
              {act.nombre}
            </h3>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums ${
              act.coste_persona > 0
                ? "bg-rausch/10 text-rausch"
                : "bg-success/10 text-success"
            }`}
          >
            {act.coste_persona > 0 ? `${act.coste_persona}€` : t("free")}
          </span>
        </div>

        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {act.descripcion}
        </p>

        {/* Practical info chips */}
        {(act.direccion || act.barrio || act.transporte) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {act.direccion ? (
              <InfoChip icon="📍" label={act.direccion} />
            ) : null}
            {act.barrio && act.barrio !== act.direccion ? (
              <InfoChip icon="🏘️" label={act.barrio} />
            ) : null}
            {act.transporte ? (
              <InfoChip icon="🚇" label={act.transporte} />
            ) : null}
          </div>
        ) : null}

        {/* Reservation / web */}
        {(act.reserva || act.web) ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
            {act.reserva ? (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span aria-hidden>🎟️</span>
                <span>{act.reserva}</span>
              </span>
            ) : null}
            {act.web ? (
              <a
                href={act.web}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-rausch underline-offset-2 hover:underline"
              >
                {t("officialWeb")} <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
        ) : null}

        {/* Tip */}
        {act.tip ? (
          <div className="mt-3 flex gap-2 rounded-2xl bg-surface-hover px-3 py-2.5">
            <span aria-hidden className="shrink-0">
              💡
            </span>
            <p className="text-[13px] italic leading-relaxed text-fg">
              {act.tip}
            </p>
          </div>
        ) : null}

        {/* Rain alternative */}
        {act.alternativa_lluvia ? (
          <div className="mt-2 flex gap-2 rounded-2xl border border-dashed border-border-strong px-3 py-2.5">
            <span aria-hidden className="shrink-0">
              🌧️
            </span>
            <p className="text-[12px] leading-relaxed text-muted">
              <span className="font-semibold text-fg">{t("ifRains")}</span>{" "}
              {act.alternativa_lluvia}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function InfoChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[12px] text-fg">
      <span aria-hidden>{icon}</span>
      <span className="line-clamp-1">{label}</span>
    </span>
  );
}
