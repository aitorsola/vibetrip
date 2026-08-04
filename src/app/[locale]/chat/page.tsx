import { setRequestLocale } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { tripDisplayLabel } from "@/server/chatContext";
import { ChatThread } from "./ChatThread";
import type { DestinationSegment } from "@/domain/trip";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChatIndexPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ trip?: string }>;
}

/**
 * Welcome screen / new conversation. Renders an empty thread; the first
 * `send()` POST creates the session server-side and the URL is replaced
 * with /chat/<id> after the stream completes.
 *
 * If the URL carries `?trip=<uuid>` (e.g. coming from the "Chat about this
 * trip" button on /trips/[id]), we validate ownership and pass it down so
 * the first POST binds the new session to that trip.
 */
export default async function ChatIndexPage({
  params,
  searchParams,
}: ChatIndexPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { trip } = await searchParams;
  let initialTripId: string | null = null;
  let focusedTripLabel: string | null = null;

  if (trip && UUID_RE.test(trip)) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("trips")
      .select("id, destinations")
      .eq("id", trip)
      .maybeSingle();
    if (data) {
      initialTripId = data.id;
      focusedTripLabel = tripDisplayLabel(
        data.destinations as DestinationSegment[],
      );
    }
  }

  return (
    <ChatThread
      initialSessionId={null}
      initialMessages={[]}
      initialTripId={initialTripId}
      focusedTripLabel={focusedTripLabel}
    />
  );
}
