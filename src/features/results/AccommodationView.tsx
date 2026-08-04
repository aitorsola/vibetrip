"use client";

import { useTranslations } from "next-intl";
import type { Accommodation } from "@/domain/accommodation";
import type { DestinationSegment, Member } from "@/domain/trip";

interface AccommodationViewProps {
  accommodation: Accommodation;
  trip: DestinationSegment;
  members: Member[];
  bookingUrlBuilder: (option: { destination: string; hotelName?: string }) => string;
}

const ACCENTS = ["#00AC00", "#7C4DFF", "#FF6B35", "#E91E63"];

export function AccommodationView({
  accommodation,
  trip,
  members,
  bookingUrlBuilder,
}: AccommodationViewProps) {
  const t = useTranslations("accommodation");
  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {accommodation.opciones.map((op, i) => {
          const accent = ACCENTS[i % ACCENTS.length] ?? "#00AC00";

          return (
            <article
              key={`${op.nombre_ejemplo}-${i}`}
              className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:shadow-card"
            >
              <div
                className="relative h-32 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
                }}
              >
                <div className="absolute inset-0 flex items-end p-4">
                  <span className="rounded-full bg-bg/95 px-3 py-1 text-[11px] font-semibold text-fg">
                    {op.tipo}
                  </span>
                </div>
                <span className="absolute right-4 top-4 text-[36px] opacity-30">
                  🏨
                </span>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-[18px] font-bold leading-tight text-fg">
                  {op.nombre_ejemplo}
                </h3>
                <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
                  <span aria-hidden>📍</span>
                  {op.zona}
                </p>

                <div className="mt-5 space-y-2 text-[13px]">
                  {op.pros.map((p, j) => (
                    <div key={`p-${j}`} className="flex gap-2">
                      <span className="shrink-0 text-success">✓</span>
                      <span className="leading-relaxed text-fg">{p}</span>
                    </div>
                  ))}
                  {op.contras.map((c, j) => (
                    <div key={`c-${j}`} className="flex gap-2">
                      <span className="shrink-0 text-muted">−</span>
                      <span className="leading-relaxed text-muted">{c}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-6">
                  <a
                    href={bookingUrlBuilder({
                      destination: trip.destination,
                      hotelName: op.nombre_ejemplo,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border-strong px-4 py-3 text-[13px] font-semibold text-fg transition-all hover:border-fg hover:bg-surface-hover"
                  >
                    {t("viewOnBooking")}
                    <span aria-hidden>↗</span>
                  </a>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-6 rounded-2xl bg-surface-hover px-5 py-4 text-[13px] leading-relaxed text-muted">
        💡{" "}
        {t("footnote", {
          start: trip.startDate,
          end: trip.endDate,
          members: members.length,
        })}
      </p>
    </div>
  );
}
