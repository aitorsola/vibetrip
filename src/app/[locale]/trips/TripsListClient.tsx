"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import type { DestinationSegment } from "@/domain/trip";
import { TripCard } from "./TripCard";
import { deleteTrips } from "./actions";

interface TripRow {
  id: string;
  created_at: string;
  destinations: DestinationSegment[];
}

interface TripsListClientProps {
  trips: TripRow[];
}

export function TripsListClient({ trips }: TripsListClientProps) {
  const t = useTranslations("trips");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedCount = selected.size;
  const allIds = useMemo(() => trips.map((t) => t.id), [trips]);
  const allSelected = selectedCount > 0 && selectedCount === allIds.length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    );
  };

  const clearSelection = () => setSelected(new Set());

  const onConfirmBulk = () => {
    setError(null);
    setConfirmOpen(false);
    const ids = [...selected];
    startTransition(async () => {
      const res = await deleteTrips(ids);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
    });
  };

  return (
    <>
      {selectedCount > 0 ? (
        <div className="sticky top-20 z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-rausch/30 bg-rausch/5 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={toggleAll}
              className="text-[12px] font-semibold text-rausch underline-offset-2 hover:underline"
            >
              {allSelected
                ? t("deselectAll")
                : t("selectAll", { count: allIds.length })}
            </button>
            <span className="text-[13px] font-semibold text-fg">
              {t("selectedCount", { count: selectedCount })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              disabled={pending}
              className="inline-flex h-9 items-center rounded-full border border-border-strong bg-surface px-4 text-[12px] font-semibold text-fg transition-all hover:bg-surface-hover disabled:opacity-50"
            >
              {t("bulkCancel")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#DC2626] px-4 text-[12px] font-semibold text-white transition-all hover:bg-[#B91C1C] disabled:opacity-50"
            >
              {pending ? t("bulkDeleting") : t("bulkDelete")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-rausch/30 bg-rausch/5 px-4 py-3 text-[13px] text-rausch"
        >
          {error}
        </div>
      ) : null}

      <ul className="space-y-3">
        {trips.map((t) => (
          <li key={t.id}>
            <TripCard
              id={t.id}
              createdAt={t.created_at}
              destinations={t.destinations}
              selected={selected.has(t.id)}
              onToggleSelect={toggle}
              busy={pending && selected.has(t.id)}
            />
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirmOpen}
        title={t("bulkDeleteTitle", { count: selectedCount })}
        description={t("bulkDeleteBody")}
        confirmLabel={t("bulkDeleteConfirm", { count: selectedCount })}
        cancelLabel={t("bulkCancel")}
        variant="danger"
        onConfirm={onConfirmBulk}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
