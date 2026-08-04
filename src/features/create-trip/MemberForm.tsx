"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  FOOD_PREFERENCES,
  INTERESTS,
  PACE_OPTIONS,
} from "@/constants/catalog";
import type { FoodPreference, Member, Pace } from "@/domain/trip";
import { uuid } from "@/lib/uuid";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Field, inputClass } from "@/ui/Field";

interface MemberDraft {
  name: string;
  interests: string[];
  food: FoodPreference;
  pace: Pace;
  notes: string;
}

const EMPTY_DRAFT: MemberDraft = {
  name: "",
  interests: [],
  food: "Sin restricciones",
  pace: "Moderado (4-5 actividades/día)",
  notes: "",
};

interface MemberFormProps {
  onAdd: (member: Member) => void;
}

export function MemberForm({ onAdd }: MemberFormProps) {
  const t = useTranslations("createTrip.memberForm");
  const tInterests = useTranslations("interests");
  const tFood = useTranslations("food");
  const tPace = useTranslations("pace");
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_DRAFT);
  const [open, setOpen] = useState(false);
  const canSubmit = draft.name.trim() !== "" && draft.interests.length > 0;

  const toggleInterest = (interest: string) => {
    setDraft((d) => ({
      ...d,
      interests: d.interests.includes(interest)
        ? d.interests.filter((i) => i !== interest)
        : [...d.interests, interest],
    }));
  };

  const submit = () => {
    if (!canSubmit) return;
    onAdd({ ...draft, id: uuid() });
    setDraft(EMPTY_DRAFT);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface-hover py-6 text-[15px] font-semibold text-muted transition-all hover:border-rausch hover:bg-rausch/5 hover:text-rausch active:scale-[0.99]"
      >
        <span className="text-[20px]">+</span>
        {t("addCta")}
      </button>
    );
  }

  return (
    <div className="min-w-0 rounded-2xl border-2 border-rausch/30 bg-surface p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[18px] font-bold text-fg">{t("title")}</h3>
        <button
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setOpen(false);
          }}
          className="rounded-full p-2 text-muted hover:bg-surface-hover hover:text-fg"
          aria-label={t("cancelAria")}
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
      </div>

      <div className="space-y-5">
        <Field label={t("nameLabel")} htmlFor="m-name">
          <input
            id="m-name"
            type="text"
            placeholder={t("namePlaceholder")}
            value={draft.name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, name: e.target.value }))
            }
            className={inputClass}
            autoFocus
          />
        </Field>

        <Field
          label={t("interestsLabel")}
          hint={
            draft.interests.length > 0
              ? t("interestsHintCount", { count: draft.interests.length })
              : t("interestsHintEmpty")
          }
        >
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip
                key={i}
                size="sm"
                active={draft.interests.includes(i)}
                onClick={() => toggleInterest(i)}
              >
                {tInterests(i)}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
          <Field label={t("foodLabel")} htmlFor="m-food">
            <select
              id="m-food"
              value={draft.food}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  food: e.target.value as FoodPreference,
                }))
              }
              className={inputClass}
            >
              {FOOD_PREFERENCES.map((f) => (
                <option key={f} value={f}>
                  {tFood(f)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("paceLabel")} htmlFor="m-pace">
            <select
              id="m-pace"
              value={draft.pace}
              onChange={(e) =>
                setDraft((d) => ({ ...d, pace: e.target.value as Pace }))
              }
              className={inputClass}
            >
              {PACE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {tPace(p)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t("notesLabel")} hint={t("notesHint")} htmlFor="m-notes">
          <input
            id="m-notes"
            type="text"
            placeholder={t("notesPlaceholder")}
            value={draft.notes}
            onChange={(e) =>
              setDraft((d) => ({ ...d, notes: e.target.value }))
            }
            className={inputClass}
          />
        </Field>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setOpen(false);
            }}
            className="w-full sm:w-auto"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {t("submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
