import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import HomeClient, { type GuestMode } from "./HomeClient";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GUEST_USED_COOKIE = "vt_guest_used";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let mode: GuestMode = "authed";
  if (!user) {
    const used = (await cookies()).get(GUEST_USED_COOKIE)?.value === "1";
    mode = used ? "guest-used" : "guest-fresh";
  }

  return <HomeClient mode={mode} />;
}
