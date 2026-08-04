import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tripDisplayLabel } from "@/server/chatContext";
import { ChatThread } from "../ChatThread";
import type { ChatRole } from "@/domain/chat";
import type { DestinationSegment } from "@/domain/trip";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function ChatDetailPage({
  params,
}: ChatDetailPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  if (!UUID_RE.test(id)) notFound();

  const supabase = await createSupabaseServerClient();

  // RLS guarantees we only get the row if the caller owns it. A non-owner
  // (or anonymous, though the layout already redirected) gets null here →
  // 404, which intentionally doesn't leak whether the session exists.
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, trip_id")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();

  const { data: rows } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  // If the session is bound to a trip, fetch its destinations to show the
  // focus banner. The trip might have been deleted (cascade nulls the FK),
  // in which case the banner just doesn't render.
  let focusedTripLabel: string | null = null;
  const tripId: string | null = session.trip_id ?? null;
  if (tripId) {
    const { data: trip } = await supabase
      .from("trips")
      .select("destinations")
      .eq("id", tripId)
      .maybeSingle();
    if (trip) {
      focusedTripLabel = tripDisplayLabel(
        trip.destinations as DestinationSegment[],
      );
    }
  }

  const messages = (rows ?? []).map((m) => ({
    id: m.id,
    role: (m.role === "assistant" ? "assistant" : "user") as ChatRole,
    content: m.content,
  }));

  return (
    <ChatThread
      initialSessionId={session.id}
      initialMessages={messages}
      initialTripId={tripId}
      focusedTripLabel={focusedTripLabel}
    />
  );
}
