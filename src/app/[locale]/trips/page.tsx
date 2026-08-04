import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TripsListClient } from "./TripsListClient";
import type { DestinationSegment } from "@/domain/trip";

export const dynamic = "force-dynamic";

interface TripRow {
  id: string;
  created_at: string;
  destinations: DestinationSegment[];
}

interface TripsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function TripsPage({ params }: TripsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "trips" });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale: locale as never });

  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, created_at, destinations")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="rounded-2xl bg-rausch/10 px-5 py-4 text-[14px] text-rausch">
          {t("loadFailed", { message: error.message })}
        </p>
      </main>
    );
  }

  const list = (trips ?? []) as TripRow[];

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-6 sm:pt-12">
      <header className="mb-8">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-rausch">
          {t("headerLabel")}
        </p>
        <h1 className="mt-2 text-[34px] font-bold leading-tight tracking-tight text-fg sm:text-[42px]">
          {t("title")}
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {list.length === 0
            ? t("summaryEmpty")
            : t("summaryCount", { count: list.length })}
        </p>
      </header>

      {list.length === 0 ? (
        <div className="rounded-3xl bg-surface p-8 text-center shadow-soft">
          <Link
            href="/"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-rausch px-5 py-2.5 text-[14px] font-semibold text-white transition-all hover:bg-rausch-dark"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <TripsListClient trips={list} />
      )}
    </main>
  );
}
