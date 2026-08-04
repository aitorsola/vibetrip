"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/routing";
import { routing, type Locale } from "@/i18n/routing";
import type { PdfLabels } from "@/features/export-pdf/exportPlan";
import type { ByokConfig } from "@/domain/llm";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTheme } from "./ThemeProvider";
import { useTripResult } from "./TripResultProvider";
import { useLlmConfig } from "./LlmConfigProvider";

interface ProviderConfig {
  provider: "anthropic" | "openai-compatible";
  kind: "anthropic" | "local" | "groq" | "cloud";
  model: string | null;
}

interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthMe {
  user: AuthUser | null;
}

interface NavbarProps {
  initialUser: AuthUser | null;
}

export function Navbar({ initialUser }: NavbarProps) {
  const t = useTranslations("navbar");
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [me, setMe] = useState<AuthUser | null>(initialUser);
  const { isRunning, requestCancel } = useTripResult();

  useEffect(() => {
    fetch("/api/trip/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProviderConfig | null) => {
        if (data) setConfig(data);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  // Refresh the auth state on the client so logout / token expiry is
  // reflected without a full page reload. Trips/Chat buttons depend on it.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AuthMe | null) => {
        if (data) setMe(data.user);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  const handleHomeClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (isRunning) {
      e.preventDefault();
      setConfirmOpen(true);
    }
  };

  const confirmLeave = () => {
    setConfirmOpen(false);
    requestCancel();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          onClick={handleHomeClick}
          className="flex items-center gap-2 group"
        >
          <Logo />
          <span className="text-[18px] font-bold tracking-tight text-rausch group-hover:text-rausch-dark transition-colors">
            vibetrip
          </span>
        </Link>

        <ConfirmDialog
          open={confirmOpen}
          title={t("leaveDuringRun.title")}
          description={t("leaveDuringRun.description")}
          confirmLabel={t("leaveDuringRun.confirm")}
          cancelLabel={t("leaveDuringRun.cancel")}
          onConfirm={confirmLeave}
          onCancel={() => setConfirmOpen(false)}
        />

        <div className="flex items-center gap-3">
          <ModelSwitcher serverConfig={config} />
          <FillSampleButton />
          <ExportPdfButton />
          {me ? <TripsButton /> : null}
          {me ? <ChatButton /> : null}
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu user={me} />
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="16" cy="16" r="14" fill="#00AC00" />
      <g transform="translate(0,-2)">
        <path
          d="M22.8 9.7c.6-.6 1.6-.6 2.1 0 .6.6.6 1.5 0 2.1l-5.2 5.2 1.6 6.7c.1.3 0 .6-.2.8l-1.1 1.1c-.3.3-.8.2-.9-.2L17 19.6l-3.6 3.6.4 2c.1.3 0 .6-.2.8l-.8.8c-.3.3-.7.2-.9-.1L10.6 24 8 21.5c-.3-.2-.4-.7-.1-.9l.8-.8c.2-.2.5-.3.8-.2l2 .4 3.6-3.6-5.5-2.1c-.4-.1-.5-.6-.2-.9l1.1-1.1c.2-.2.5-.3.8-.2l6.7 1.6 5.1-5z"
          fill="white"
        />
      </g>
    </svg>
  );
}

const PROVIDER_PRESETS: Record<
  ByokConfig["provider"],
  { label: string; models: string[] }
> = {
  openai: { label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "o4-mini"] },
  anthropic: {
    label: "Anthropic",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-haiku-latest"],
  },
};

/** Navbar pill turned dropdown: shows the active model and lets the user swap
 *  vibetrip's default for their own provider key (BYOK). The key is stored
 *  client-side only and sent per-request; here we just validate + persist it. */
function ModelSwitcher({ serverConfig }: { serverConfig: ProviderConfig | null }) {
  const t = useTranslations("navbar");
  const { config: byok, setConfig, clearConfig } = useLlmConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const [provider, setProvider] = useState<ByokConfig["provider"]>(
    byok?.provider ?? "openai",
  );
  const [model, setModel] = useState(byok?.model ?? "");
  const [apiKey, setApiKey] = useState(byok?.apiKey ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Seed the form from the saved config each time the panel opens, so
  // reopening after a cancelled edit shows what is actually stored.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProvider(byok?.provider ?? "openai");
    setModel(byok?.model ?? "");
    setApiKey(byok?.apiKey ?? "");
    setStatus("idle");
    setReason(null);
  }, [open, byok]);

  const displayModel = byok?.model ?? serverConfig?.model ?? null;
  if (!displayModel) return null;

  const reasonMessage = (code: string | null): string => {
    switch (code) {
      case "byok_invalid_key":
        return t("model.invalidKey");
      case "byok_unknown_model":
        return t("model.unknownModel");
      default:
        return t("model.unreachable");
    }
  };

  const save = async () => {
    const m = model.trim();
    const k = apiKey.trim();
    if (!m || !k) return;
    setStatus("saving");
    setReason(null);
    try {
      const res = await fetch("/api/llm/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: m, apiKey: k }),
      });
      const data: { ok?: boolean; reason?: string } | null = await res
        .json()
        .catch(() => null);
      if (data?.ok) {
        setConfig({ provider, model: m, apiKey: k });
        setOpen(false);
      } else {
        setStatus("error");
        setReason(data?.reason ?? "byok_unreachable");
      }
    } catch {
      setStatus("error");
      setReason("byok_unreachable");
    }
  };

  const useDefault = () => {
    clearConfig();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t("model.title")}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-3 py-1 font-mono text-[11px] font-semibold text-muted transition-colors hover:bg-surface"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-rausch" />
        {byok ? <KeyIcon /> : null}
        {displayModel}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card">
          <p className="pb-3 text-[12px] font-bold uppercase tracking-wider text-muted">
            {t("model.title")}
          </p>

          {/* Label and model id stack instead of competing for the same row —
              side by side, a long id pushed the label into two lines. */}
          <button
            type="button"
            onClick={useDefault}
            className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
              byok
                ? "border-border hover:bg-surface-hover"
                : "border-rausch bg-rausch/5"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[13px] font-semibold ${
                  byok ? "text-fg" : "text-rausch"
                }`}
              >
                {t("model.default")}
              </span>
              {serverConfig?.model ? (
                <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                  {serverConfig.model}
                </span>
              ) : null}
            </span>
            {byok ? null : <CheckIcon />}
          </button>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {t("model.orOwnKey")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            {(["openai", "anthropic"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex-1 rounded-lg border px-2 py-2 text-[12px] font-semibold transition-colors ${
                  provider === p
                    ? "border-rausch bg-rausch/5 text-rausch"
                    : "border-border text-fg hover:bg-surface-hover"
                }`}
              >
                {PROVIDER_PRESETS[p].label}
              </button>
            ))}
          </div>

          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={PROVIDER_PRESETS[provider].models[0]}
            list={`vt-models-${provider}`}
            className="mt-2.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 font-mono text-[12px] text-fg outline-none focus:border-rausch"
          />
          <datalist id={`vt-models-${provider}`}>
            {PROVIDER_PRESETS[provider].models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("model.apiKeyPlaceholder")}
            autoComplete="off"
            className="mt-2.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 font-mono text-[12px] text-fg outline-none focus:border-rausch"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {t("model.byokHint")}
          </p>

          {status === "error" ? (
            <p className="mt-2 text-[11px] font-semibold text-rausch">
              {reasonMessage(reason)}
            </p>
          ) : null}

          <button
            type="button"
            onClick={save}
            disabled={status === "saving" || !model.trim() || !apiKey.trim()}
            className="mt-3 w-full rounded-lg bg-rausch px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-rausch-dark disabled:opacity-60"
          >
            {status === "saving" ? t("model.saving") : t("model.save")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-rausch"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.5 12.5 21 2M16 7l3 3M14 9l2.5 2.5" />
    </svg>
  );
}

const LOCALE_LABEL: Record<Locale, { flag: string; label: string }> = {
  es: { flag: "🇪🇸", label: "Español" },
  en: { flag: "🇬🇧", label: "English" },
  fr: { flag: "🇫🇷", label: "Français" },
  de: { flag: "🇩🇪", label: "Deutsch" },
  it: { flag: "🇮🇹", label: "Italiano" },
  pt: { flag: "🇵🇹", label: "Português" },
};

function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Read the active locale from the html lang attribute set in the layout.
  // It can't be a lazy useState initializer: that runs during SSR too, where
  // there is no document.
  const [active, setActive] = useState<Locale>("es");
  useEffect(() => {
    const lang = document.documentElement.lang as Locale;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (LOCALE_LABEL[lang]) setActive(lang);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const change = (locale: Locale) => {
    setOpen(false);
    router.replace(pathname, { locale });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={LOCALE_LABEL[active].label}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-surface text-[18px] transition-all hover:bg-surface-hover active:scale-95"
      >
        {LOCALE_LABEL[active].flag}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          {routing.locales.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => change(loc)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-surface-hover ${
                loc === active ? "text-rausch" : "text-fg"
              }`}
            >
              <span className="text-[16px]">{LOCALE_LABEL[loc].flag}</span>
              <span>{LOCALE_LABEL[loc].label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TripsButton() {
  const t = useTranslations("navbar");
  return (
    <Link
      href="/trips"
      aria-label={t("myTrips")}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-[13px] font-semibold text-fg transition-all hover:border-fg hover:bg-surface-hover active:scale-95"
    >
      <SuitcaseIcon />
      <span className="hidden sm:inline">{t("myTrips")}</span>
    </Link>
  );
}

function SuitcaseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function ChatButton() {
  const t = useTranslations("navbar");
  return (
    <Link
      href="/chat"
      aria-label={t("chat")}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-[13px] font-semibold text-fg transition-all hover:border-fg hover:bg-surface-hover active:scale-95"
    >
      <ChatIcon />
      <span className="hidden sm:inline">{t("chat")}</span>
    </Link>
  );
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function FillSampleButton() {
  const t = useTranslations("navbar");
  const { hasFillSample, requestFillSample } = useTripResult();
  if (!hasFillSample) return null;
  return (
    <button
      type="button"
      onClick={requestFillSample}
      title={t("fillSampleAria")}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-[13px] font-semibold text-fg transition-all hover:border-fg hover:bg-surface-hover active:scale-95"
    >
      <span aria-hidden>⚡</span>
      <span className="hidden sm:inline">{t("fillSample")}</span>
    </button>
  );
}

function ExportPdfButton() {
  const t = useTranslations("navbar");
  const tPdf = useTranslations("pdf");
  const tResults = useTranslations("results");
  const tGroup = useTranslations("group");
  const tBudget = useTranslations("budget");
  const tItinerary = useTranslations("itinerary");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { data } = useTripResult();
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { exportPlanToPdf } = await import(
        "@/features/export-pdf/exportPlan"
      );
      // Build the localised labels bundle once. The PDF module is presentation
      // only and doesn't import next-intl directly.
      const labels = {
        subtitle: tPdf("subtitle"),
        summary: (members: number, nights: number) =>
          tPdf("summary", { members, nights }),
        destinationsTitle: tPdf("destinationsTitle"),
        destinationLine: ({
          from,
          to,
          nights,
          budget,
        }: {
          from: string;
          to: string;
          nights: number;
          budget: number;
        }) => tPdf("destinationLine", { from, to, nights, budget }),
        consensusTitle: tPdf("consensusTitle"),
        recommendation: tPdf("recommendation"),
        groupSection: tPdf("groupSection"),
        groupSectionTitle: tPdf("groupSectionTitle"),
        itinerarySection: tPdf("itinerarySection"),
        accommodationSection: tPdf("accommodationSection"),
        budgetSection: tPdf("budgetSection"),
        travellersSection: tPdf("travellersSection"),
        travellersSectionTitle: tPdf("travellersSectionTitle"),
        destinationDivider: (n: number, total: number) =>
          `${tPdf("travellersSection")} ${n} / ${total}`.toUpperCase(),
        buildTag: (number: number, label: string, suffix?: string) =>
          `${String(number).padStart(2, "0")} / ${label}${suffix ? ` ${suffix}` : ""}`,
        perPerson: tResults("kpis.perPerson"),
        groupTotal: tResults("kpis.groupTotal"),
        nights: tResults("kpis.nights"),
        activities: tResults("kpis.activities"),
        paceLabel: tGroup("paceLabel"),
        interestsLabel: tGroup("interestsLabel"),
        restrictionsLabel: tGroup("restrictionsLabel"),
        conflictsLabel: tGroup("conflictsLabel"),
        noRestrictions: tGroup("noRestrictions"),
        pros: tPdf("pros"),
        cons: tPdf("cons"),
        tip: tPdf("tip"),
        ifRains: tPdf("ifRains"),
        breakdown: tPdf("breakdown"),
        totalPerPerson: tPdf("totalPerPerson"),
        groupTotalLine: (count: number) => tPdf("groupTotal", { count }),
        inBudget: tPdf("inBudget"),
        overBudget: tPdf("overBudget"),
        budgetVerdictLine: (goal: number, estimated: number, diff: number) =>
          `${tCommon("perPerson")}: ${goal}€ · ${estimated}€ · ${diff}€`,
        notIncluded: tPdf("notIncluded"),
        pdfNotesLabel: tPdf("notesLabel"),
        pdfInterestsLabel: tPdf("interestsLabel"),
        fieldAddress: tPdf("fieldAddress"),
        fieldNeighbourhood: tPdf("fieldNeighbourhood"),
        fieldTransport: tPdf("fieldTransport"),
        fieldDuration: tPdf("fieldDuration"),
        fieldReservation: tPdf("fieldReservation"),
        fieldWeb: tPdf("fieldWeb"),
        free: tPdf("free"),
        perPaxSuffix: tPdf("perPaxSuffix"),
        minutesUnit: tPdf("minutesUnit"),
        optionLabel: (n: number, type: string) =>
          `${tBudget("breakdownTitle").toUpperCase().split(" ")[0]} ${n} · ${type}`,
        itinerarySectionTitle: (dest: string) =>
          `${tPdf("itinerarySection")} — ${dest}`,
        accommodationSectionTitle: (dest: string) =>
          `${tPdf("accommodationSection")} — ${dest}`,
        budgetSectionTitle: (dest: string) =>
          `${tPdf("budgetSection")} — ${dest}`,
        slot: (key: "manana" | "almuerzo" | "tarde" | "cena") =>
          tItinerary(`slot.${key}`),
        type: (key: "cultura" | "comida" | "naturaleza" | "ocio" | "transporte") =>
          tItinerary(`type.${key}`),
      } satisfies PdfLabels;
      exportPlanToPdf({ ...data, labels, locale });
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={t("exportPdfAria")}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-rausch px-4 text-[13px] font-semibold text-white transition-all hover:bg-rausch-dark active:scale-95 disabled:opacity-60"
    >
      {busy ? <Spinner /> : <DownloadIcon />}
      <span className="hidden sm:inline">
        {busy ? t("exporting") : t("exportPdf")}
      </span>
    </button>
  );
}

function DownloadIcon() {
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
      aria-hidden
    >
      <path d="M12 4v12M6 12l6 6 6-6M4 20h16" />
    </svg>
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
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={2.4}
        opacity={0.3}
      />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserMenu({ user: me }: { user: AuthUser | null }) {
  const t = useTranslations("navbar");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const onLoginPage = pathname === "/login" || pathname?.startsWith("/login/");

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!me) {
    if (onLoginPage) return null;
    return (
      <Link
        href="/login"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-4 text-[13px] font-semibold text-fg transition-all hover:border-fg hover:bg-surface-hover"
      >
        {t("login")}
      </Link>
    );
  }

  const initial = (me.email ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("account")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rausch text-[14px] font-bold text-white transition-all hover:bg-rausch-dark active:scale-95"
      >
        {initial}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-[13px] font-semibold text-fg">
              {me.email}
            </p>
            <p className="text-[11px] text-muted">{t("sessionActive")}</p>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="block w-full px-4 py-3 text-left text-[13px] font-semibold text-fg transition-colors hover:bg-surface-hover"
            >
              {t("logout")}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const t = useTranslations("navbar");
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The theme comes from localStorage, so the server can't know it. Render the
  // neutral state first and swap after hydration, otherwise React reports a
  // mismatch on the toggle icon.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t("themeLight") : t("themeDark")}
      suppressHydrationWarning
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-surface text-fg transition-all hover:bg-surface-hover hover:scale-105 active:scale-95"
    >
      <span suppressHydrationWarning className="inline-flex">
        {mounted ? isDark ? <SunIcon /> : <MoonIcon /> : null}
      </span>
    </button>
  );
}

function SunIcon() {
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
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
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
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
