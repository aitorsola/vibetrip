"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Generates (or retrieves) a share token for a trip via the
 * `share_trip(trip_id)` Postgres RPC. The RPC is SECURITY DEFINER and
 * checks ownership against `auth.uid()`, so we pass through the user's
 * cookie-bound Supabase client unchanged.
 *
 * Returns the UUID-shaped share token. The caller composes the share URL
 * (`/${locale}/shared/${token}`) on the client.
 */
export async function shareTripAction(
  id: string,
): Promise<{ ok: true; token: string } | { error: string }> {
  const t = await getTranslations("trips");
  if (!id || typeof id !== "string") {
    return { error: t("errorInvalidId") };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("errorSessionExpired") };

  const { data, error } = await supabase.rpc("share_trip", { trip_id: id });
  if (error || typeof data !== "string") {
    return { error: error?.message ?? "share_trip rpc failed" };
  }
  return { ok: true, token: data };
}

/**
 * Clears the share token, immediately invalidating any URL the owner
 * had handed out.
 */
export async function revokeShareAction(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations("trips");
  if (!id || typeof id !== "string") {
    return { error: t("errorInvalidId") };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("errorSessionExpired") };

  const { error } = await supabase.rpc("revoke_share", { trip_id: id });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function deleteTrip(
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const t = await getTranslations("trips");
  if (!id || typeof id !== "string") {
    return { error: t("errorInvalidId") };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("errorSessionExpired") };

  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/trips");
  return { ok: true };
}

export async function deleteTrips(
  ids: string[],
): Promise<{ ok: true; deleted: number } | { error: string }> {
  const t = await getTranslations("trips");
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: t("errorNoSelection") };
  }
  const cleanIds = ids.filter((id) => typeof id === "string" && id.length > 0);
  if (cleanIds.length === 0) return { error: t("errorInvalidIds") };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("errorSessionExpired") };

  const { error, count } = await supabase
    .from("trips")
    .delete({ count: "exact" })
    .in("id", cleanIds);
  if (error) return { error: error.message };

  revalidatePath("/trips");
  return { ok: true, deleted: count ?? cleanIds.length };
}
