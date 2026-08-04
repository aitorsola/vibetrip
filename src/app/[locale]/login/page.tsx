import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
  params: Promise<{ locale: string }>;
}

export default async function LoginPage({
  searchParams,
  params,
}: LoginPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const t = await getTranslations({ locale, namespace: "login" });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect({ href: (next || "/") as "/", locale: locale as never });
  }

  return (
    <main className="relative isolate min-h-[calc(100vh-5rem)] overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-rausch/30 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-15%] left-[-10%] h-[480px] w-[480px] rounded-full bg-[#7C4DFF]/20 blur-[140px]"
      />

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-20 lg:py-20">
        <section className="hidden flex-col gap-8 lg:flex">
          <h1 className="text-[44px] font-bold leading-[1.05] tracking-tight text-fg sm:text-[56px]">
            {t("heroLine1")}{" "}
            <span className="bg-gradient-to-r from-rausch to-[#FF8A6B] bg-clip-text text-transparent">
              {t("heroAccent")}
            </span>
          </h1>
          <p className="max-w-md text-[16px] leading-relaxed text-muted">
            {t("heroSubtitle")}
          </p>
          <ul className="space-y-3 text-[14px] text-fg">
            <Feature text={t("feature1")} />
            <Feature text={t("feature2")} />
            <Feature text={t("feature3")} />
          </ul>
        </section>

        <section className="w-full">
          <div className="rounded-[28px] border border-border bg-surface/80 p-8 shadow-card backdrop-blur sm:p-10">
            <div className="mb-7">
              <h2 className="text-[28px] font-bold tracking-tight text-fg">
                {t("cardTitle")}
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                {t("cardSubtitle")}
              </p>
            </div>
            <LoginForm next={next ?? "/"} />
            <p className="mt-6 text-center text-[12px] leading-relaxed text-subtle">
              {t("footer")}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rausch/15 text-rausch"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span>{text}</span>
    </li>
  );
}
