import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TripDetail } from "./TripDetail";
import type { PlanResult } from "@/domain/plan";
import type { DestinationSegment, Member } from "@/domain/trip";

export const dynamic = "force-dynamic";

interface TripPageProps {
  params: Promise<{ id: string; locale: string }>;
}

interface TripRow {
  id: string;
  destinations: DestinationSegment[];
  members: Member[];
  result: PlanResult;
  share_token: string | null;
}

export default async function TripPage({ params }: TripPageProps) {
  const { id, locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale: locale as never });

  const { data, error } = await supabase
    .from("trips")
    .select("id, destinations, members, result, share_token")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const trip = data as TripRow;

  return (
    <TripDetail
      id={trip.id}
      destinations={trip.destinations}
      members={trip.members}
      result={trip.result}
      initialShareToken={trip.share_token}
    />
  );
}
