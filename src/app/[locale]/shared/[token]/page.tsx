import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SharedTripClient } from "./SharedTripClient";
import type { PlanResult } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";

export const dynamic = "force-dynamic";

interface SharedTripPageProps {
  params: Promise<{ token: string; locale: string }>;
}

interface SharedTripRow {
  id: string;
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public route a trip-owner shares with anyone. The `get_shared_trip`
 * Postgres RPC is granted to both `anon` and `authenticated` roles, so
 * the page renders identically whether the visitor is logged in or not
 * — only the "Save to my trips" CTA changes behaviour.
 */
export default async function SharedTripPage({ params }: SharedTripPageProps) {
  const { token, locale } = await params;
  setRequestLocale(locale);

  if (!UUID_RE.test(token)) notFound();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .rpc("get_shared_trip", { token })
    .maybeSingle();
  if (error || !data) notFound();

  const trip = data as SharedTripRow;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <SharedTripClient
      token={token}
      destinations={trip.destinations}
      members={trip.members}
      result={trip.result}
      isLoggedIn={!!user}
    />
  );
}
