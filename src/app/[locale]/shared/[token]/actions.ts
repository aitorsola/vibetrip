"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlanResult } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SharedTripRow {
  id: string;
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
}

/**
 * Saves a shared trip into the current user's `trips`. Server-side flow:
 *
 *   1. Reload the trip via `get_shared_trip(token)` — same RPC the page
 *      uses, so the saved row is exactly what the user is viewing.
 *   2. INSERT a fresh row. The `user_id` column has a `DEFAULT auth.uid()`,
 *      so we don't need to pass it explicitly; RLS' WITH CHECK clause
 *      validates ownership against the JWT.
 *   3. Revalidate the trips list path so the user sees their copy on
 *      return.
 */
export async function saveSharedTripAction(
  token: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const t = await getTranslations("share");

  if (!token || !UUID_RE.test(token)) {
    return { error: t("errors.invalidToken") };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.sessionExpired") };

  const { data: rpcData, error: rpcErr } = await supabase
    .rpc("get_shared_trip", { token })
    .maybeSingle();
  if (rpcErr || !rpcData) {
    return { error: t("errors.notFound") };
  }
  const shared = rpcData as SharedTripRow;

  const { data: inserted, error: insErr } = await supabase
    .from("trips")
    .insert({
      destinations: shared.destinations,
      members: shared.members,
      result: shared.result,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return { error: insErr?.message ?? t("errors.saveFailed") };
  }

  revalidatePath("/trips");
  return { ok: true, id: inserted.id };
}
