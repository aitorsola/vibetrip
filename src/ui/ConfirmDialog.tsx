"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // The dialog portals into document.body, which only exists after hydration.
  // One extra render on mount is the price; useSyncExternalStore would need a
  // cached snapshot for a value that never changes after the first paint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Esc to cancel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Auto-focus the cancel button (safer default)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-autofocus]")
        ?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open || !mounted) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-[#DC2626] text-white hover:bg-[#B91C1C]"
      : "bg-rausch text-white hover:bg-rausch-dark";

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-[15vh] sm:items-center sm:pt-4"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-lift animate-slide-up"
      >
        <h2
          id="confirm-dialog-title"
          className="text-[20px] font-bold tracking-tight text-fg"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            data-autofocus
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border-strong bg-surface px-5 text-[14px] font-semibold text-fg transition-all hover:bg-surface-hover active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-[14px] font-semibold transition-all active:scale-[0.98] ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
