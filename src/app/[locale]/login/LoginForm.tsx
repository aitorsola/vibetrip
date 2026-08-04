"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { sendMagicLink } from "./actions";

interface LoginFormProps {
  next: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const t = useTranslations("login");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    startTransition(async () => {
      const res = await sendMagicLink(formData);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSentTo(email);
    });
  };

  if (sentTo) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-fg">
              {t("sentTitle")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {t("sentBody", { email: sentTo })}
            </p>
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
              className="mt-3 text-[12px] font-semibold text-rausch underline-offset-2 hover:underline"
            >
              {t("sentRetry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">
          {t("emailLabel")}
        </span>
        <div className="relative mt-2">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
            </svg>
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            placeholder={t("emailPlaceholder")}
            className="w-full rounded-xl border border-border bg-bg py-3.5 pl-11 pr-4 text-[15px] text-fg placeholder-subtle outline-none transition-all focus:border-rausch focus:ring-4 focus:ring-rausch/15"
          />
        </div>
      </label>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rausch/20 bg-rausch/5 px-3.5 py-3 text-[13px] text-rausch"
        >
          <span aria-hidden className="mt-0.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </span>
          <span className="leading-relaxed">{error}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rausch px-5 py-3.5 text-[15px] font-semibold text-white shadow-soft transition-all hover:bg-rausch-dark hover:shadow-card active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Spinner />
            <span>{t("submitting")}</span>
          </>
        ) : (
          <>
            <span>{t("submit")}</span>
            <Arrow />
          </>
        )}
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.4} opacity={0.35} />
      <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform group-hover:translate-x-0.5"
      aria-hidden
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
