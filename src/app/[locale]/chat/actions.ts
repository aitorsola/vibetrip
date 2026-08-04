"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side delete used by the sidebar trash button. RLS already restricts
 * the row to the caller; we only need an explicit auth check to give a clean
 * error message when the cookie has expired.
 */
export async function deleteSessionAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations("chat");

  if (!id || typeof id !== "string") {
    return { error: t("errorDelete") };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("errorDelete") };

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/chat");
  return { ok: true };
}
