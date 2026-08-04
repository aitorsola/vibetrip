"use client";

import { flagForDestination } from "@/domain/countries";
import type { DestinationSegment } from "@/domain/trip";

interface DestinationsTitleProps {
  destinations: DestinationSegment[];
}

/** Headline that switches between single-destination ("Lisboa 🇵🇹") and
 *  multi-destination ("Ámsterdam 🇳🇱 · Berlín 🇩🇪") layouts. */
export function DestinationsTitle({ destinations }: DestinationsTitleProps) {
  if (destinations.length === 1) {
    const d = destinations[0]!;
    const flag = flagForDestination(d.destination);
    return (
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[36px] font-bold leading-tight tracking-tight text-fg sm:text-[44px]">
        <span>{d.destination}</span>
        {flag && (
          <span aria-hidden className="text-[34px] sm:text-[40px]">
            {flag}
          </span>
        )}
      </h1>
    );
  }

  return (
    <h1 className="mt-2 text-[36px] font-bold leading-tight tracking-tight text-fg sm:text-[44px]">
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {destinations.map((d, i) => {
          const flag = flagForDestination(d.destination);
          return (
            <span key={`${d.destination}-${i}`} className="flex items-center gap-1.5">
              <span>{d.destination}</span>
              {flag && (
                <span aria-hidden className="text-[32px] sm:text-[38px]">
                  {flag}
                </span>
              )}
              {i < destinations.length - 1 && <span className="text-muted">·</span>}
            </span>
          );
        })}
      </span>
    </h1>
  );
}
