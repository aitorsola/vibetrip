"use client";

import { useTranslations } from "next-intl";
import type { Member } from "@/domain/trip";

interface MemberListProps {
  members: Member[];
  onRemove: (id: string) => void;
}

const AVATAR_COLORS = [
  "#00AC00",
  "#7C4DFF",
  "#FF6B35",
  "#E91E63",
  "#3E96E0",
  "#E0A82E",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "#00AC00";
}

export function MemberList({ members, onRemove }: MemberListProps) {
  const t = useTranslations("createTrip.memberList");
  const tInterests = useTranslations("interests");
  // Interests are stored as their Spanish wire values (shared with iOS).
  // Translate for display, falling back to the raw value for entries from
  // older catalogs that no longer have a message key.
  const interestLabel = (i: string) => (tInterests.has(i) ? tInterests(i) : i);
  if (members.length === 0) return null;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 [&>li]:min-w-0">
      {members.map((m) => (
        <li
          key={m.id}
          className="group relative flex min-w-0 items-center gap-4 rounded-2xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-soft"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
            style={{ backgroundColor: avatarColor(m.id) }}
            aria-hidden
          >
            {m.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-fg">
              {m.name}
            </div>
            <div className="truncate text-[13px] text-muted">
              {m.interests.slice(0, 3).map(interestLabel).join(" · ")}
              {m.interests.length > 3 ? ` +${m.interests.length - 3}` : ""}
            </div>
          </div>

          <button
            onClick={() => onRemove(m.id)}
            aria-label={t("removeAria", { name: m.name })}
            className="shrink-0 rounded-full p-2 text-muted opacity-0 transition-all hover:bg-rausch/10 hover:text-rausch group-hover:opacity-100 focus-visible:opacity-100"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <path d="M6 6L18 18M6 18L18 6" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
