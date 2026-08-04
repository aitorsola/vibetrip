"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function sendMagicLink(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/").trim() || "/";
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "login" });

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: t("errorInvalidEmail") };
  }

  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get("origin") ?? "";
  // Forward the user's active locale so the callback drops them back into
  // the same language they started in.
  const callbackUrl =
    `${origin}/auth/callback?next=${encodeURIComponent(next)}` +
    `&locale=${encodeURIComponent(locale)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl },
  });

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Untyped string redirect — middleware will land us on the right locale.
  redirect("/login");
}
