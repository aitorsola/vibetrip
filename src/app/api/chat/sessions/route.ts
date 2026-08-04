import type { NextRequest } from "next/server";
import { createSupabaseAuthedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface SessionListItem {
  id: string;
  title: string | null;
  tripId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * List the caller's chat sessions, newest activity first. RLS guarantees the
 * user only sees their own rows; the explicit auth check is for a clean 401
 * instead of an empty array on anonymous calls.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseAuthedClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, trip_id, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const sessions: SessionListItem[] = (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    tripId: s.trip_id,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));
  return Response.json({ sessions });
}
