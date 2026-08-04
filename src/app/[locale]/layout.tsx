import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { ThemeProvider } from "@/ui/ThemeProvider";
import { TripResultProvider } from "@/ui/TripResultProvider";
import { LlmConfigProvider } from "@/ui/LlmConfigProvider";
import { Navbar } from "@/ui/Navbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

export const metadata: Metadata = {
  title: "vibetrip",
  description:
    "Plan your trip — solo or in a group — with AI agents: consensus, itinerary, accommodation, budget.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const themeBootstrapScript = `
(function() {
  try {
    var stored = localStorage.getItem('vibetrip-theme');
    var prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefers ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

interface LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const initialUser = user ? { id: user.id, email: user.email ?? null } : null;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin=""
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          // The script runs once at SSR-paint to apply the saved theme
          // before first paint (avoids a flash). React warns that scripts
          // in JSX don't re-execute on the client; that's intended here —
          // we only need the initial paint behaviour.
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
          suppressHydrationWarning
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <LlmConfigProvider>
              <TripResultProvider>
                <Navbar initialUser={initialUser} />
                <main className="pt-20">{children}</main>
              </TripResultProvider>
            </LlmConfigProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
