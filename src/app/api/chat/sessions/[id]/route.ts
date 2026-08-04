import type { NextRequest } from "next/server";
import { createSupabaseAuthedClient } from "@/lib/supabase/server";
import type { ChatRole } from "@/domain/chat";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SessionDetail {
  session: {
    id: string;
    title: string | null;
    tripId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  messages: Array<{
    id: string;
    role: ChatRole;
    content: string;
    createdAt: string;
  }>;
}

/**
 * Full conversation detail: session metadata + all messages in chronological
 * order. RLS enforces ownership; an anonymous or non-owner caller gets 404
 * rather than 403, which is intentional — we don't disclose existence.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "invalid session id" }, { status: 400 });
  }

  const supabase = await createSupabaseAuthedClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: session, error: sessionErr } = await supabase
    .from("chat_sessions")
    .select("id, title, trip_id, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (sessionErr) {
    return Response.json({ error: sessionErr.message }, { status: 500 });
  }
  if (!session) return Response.json({ error: "not found" }, { status: 404 });

  const { data: msgs, error: msgsErr } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });
  if (msgsErr) {
    return Response.json({ error: msgsErr.message }, { status: 500 });
  }

  const detail: SessionDetail = {
    session: {
      id: session.id,
      title: session.title,
      tripId: session.trip_id ?? null,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    },
    messages: (msgs ?? []).map((m) => ({
      id: m.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
      createdAt: m.created_at,
    })),
  };
  return Response.json(detail);
}

/**
 * Delete a chat session and all its messages. ON DELETE CASCADE on the
 * `session_id` foreign key takes care of cleaning up `chat_messages`.
 * RLS makes this a no-op for non-owners; we surface 404 in that case so the
 * client gets the same shape it would for "doesn't exist".
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "invalid session id" }, { status: 400 });
  }

  const supabase = await createSupabaseAuthedClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
