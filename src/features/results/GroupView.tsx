"use client";

import { useTranslations } from "next-intl";
import type { Consensus } from "@/domain/consensus";
import type { Member } from "@/domain/trip";

interface GroupViewProps {
  consensus: Consensus;
  members: Member[];
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

export function GroupView({ consensus, members }: GroupViewProps) {
  const t = useTranslations("group");
  const tInterests = useTranslations("interests");
  const tFood = useTranslations("food");
  const tPace = useTranslations("pace");
  const c = consensus.consenso;

  // Member preferences are stored as their Spanish wire values (shared with
  // iOS). Translate for display, falling back to the raw value for entries
  // saved under older catalogs that no longer have a message key.
  const interestLabel = (i: string) => (tInterests.has(i) ? tInterests(i) : i);
  const foodLabel = (f: string) => (tFood.has(f) ? tFood(f) : f);
  const paceLabel = (p: string) => (tPace.has(p) ? tPace(p) : p);

  return (
    <div className="space-y-6">
      {/* Consensus card */}
      <section className="overflow-hidden rounded-3xl bg-surface shadow-soft">
        <div className="bg-gradient-to-br from-rausch/10 via-rausch/5 to-transparent p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-rausch">
            <span aria-hidden>🤝</span>
            {t("consensusTitle")}
          </div>
          <p className="mt-3 text-[20px] font-medium italic leading-relaxed text-fg sm:text-[22px]">
            «{c.recomendacion}»
          </p>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2">
          <Item emoji="🎯" label={t("paceLabel")} value={c.ritmo_ideal} />
          <Item
            emoji="💖"
            label={t("interestsLabel")}
            value={c.intereses_comunes.map(interestLabel).join(" · ") || "—"}
          />
          <Item
            emoji="🥗"
            label={t("restrictionsLabel")}
            value={
              c.restricciones_alimentarias.map(foodLabel).join(" · ") ||
              t("noRestrictions")
            }
          />
          <Item
            emoji={c.conflictos.length > 0 ? "⚡" : "✨"}
            label={c.conflictos.length > 0 ? t("conflictsLabel") : t("profileLabel")}
            value={
              c.conflictos.length > 0
                ? c.conflictos.join(" · ")
                : consensus.perfil_grupo
            }
            highlight={c.conflictos.length > 0}
          />
        </div>
      </section>

      {/* Members grid */}
      <section>
        <h2 className="mb-4 text-[20px] font-bold tracking-tight text-fg">
          {t("membersTitle")} · {members.length}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {members.map((m) => (
            <article
              key={m.id}
              className="rounded-3xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-soft"
            >
              <header className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-white"
                  style={{ backgroundColor: avatarColor(m.id) }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[18px] font-bold text-fg">
                    {m.name}
                  </h3>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {foodLabel(m.food)} · {paceLabel(m.pace).split(" (")[0]}
                  </p>
                </div>
              </header>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {m.interests.map((i) => (
                  <span
                    key={i}
                    className="rounded-full bg-surface-hover px-2.5 py-1 text-[12px] font-semibold text-fg"
                  >
                    {interestLabel(i)}
                  </span>
                ))}
              </div>

              {m.notes ? (
                <div className="mt-4 flex gap-2 rounded-2xl bg-surface-hover px-3 py-2.5">
                  <span aria-hidden className="shrink-0">
                    💬
                  </span>
                  <p className="text-[13px] italic leading-relaxed text-muted">
                    {m.notes}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

interface ItemProps {
  emoji: string;
  label: string;
  value: string;
  highlight?: boolean;
}

function Item({ emoji, label, value, highlight = false }: ItemProps) {
  return (
    <div className="bg-surface p-5">
      <div
        className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ${
          highlight ? "text-rausch" : "text-muted"
        }`}
      >
        <span aria-hidden>{emoji}</span>
        {label}
      </div>
      <p className="mt-1.5 text-[15px] leading-relaxed text-fg">{value}</p>
    </div>
  );
}
