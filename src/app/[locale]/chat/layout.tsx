import type { ReactNode } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChatSidebar, type SidebarSession } from "./ChatSidebar";

export const dynamic = "force-dynamic";

interface ChatLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Shared shell for the chat experience: sessions list on the left, active
 * conversation on the right (children). The layout fetches the sidebar data
 * once for both the index and the [id] sub-route, so navigating between
 * sessions doesn't refetch it.
 */
export default async function ChatLayout({
  children,
  params,
}: ChatLayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "chat" });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale: locale as never });

  const { data: rows } = await supabase
    .from("chat_sessions")
    .select("id, title, trip_id, updated_at")
    .order("updated_at", { ascending: false });

  const sessions: SidebarSession[] = (rows ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    hasTrip: s.trip_id !== null,
    updatedAt: s.updated_at,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6">
      {/* Just the title: the eyebrow repeated it verbatim, and the pitch it
          carried is already on the welcome screen, where it's actionable. */}
      <header className="mb-6">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-fg sm:text-[34px]">
          {t("title")}
        </h1>
      </header>
      <div className="flex gap-5">
        <ChatSidebar sessions={sessions} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  );
}
