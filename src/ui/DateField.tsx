"use client";

import { useRef, type ChangeEvent } from "react";

interface DateFieldProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  min?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Date input that renders our own UI (always full-width, always shows the
 * format placeholder when empty) and delegates picker opening to a native
 * <input type="date"> that's overlaid invisibly on top.
 *
 * Why: iOS Safari renders <input type="date"> as a native widget whose
 * internal layout can paint outside its CSS box on narrow columns and which
 * silently drops the placeholder text in some configurations. We get around
 * both by drawing the visible cell ourselves.
 */
export function DateField({
  id,
  value,
  onChange,
  min,
  disabled = false,
  placeholder = "dd/mm/aaaa",
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const display = value ? formatDateEs(value) : "";

  const openPicker = () => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // showPicker() is the modern API and works on iOS 16+, Chrome, Safari.
    // Fall back to focus + click for older browsers.
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* user-activation may have been lost; falls through */
      }
    }
    el.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div
      className={`input relative flex cursor-text items-center ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
      onClick={openPicker}
      role="presentation"
    >
      <span
        className={`min-w-0 flex-1 truncate ${
          display ? "text-fg" : "text-subtle"
        }`}
      >
        {display || placeholder}
      </span>
      <CalendarIcon />
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        min={min}
        disabled={disabled}
        onChange={handleChange}
        // Visually invisible but still receives the picker event when the
        // wrapper is clicked. opacity:0 (not visibility/display) keeps it
        // focusable.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={placeholder}
      />
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="ml-2 shrink-0 text-muted"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function formatDateEs(iso: string): string {
  // ISO is "YYYY-MM-DD" — split on dash to avoid timezone surprises.
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}
