import type { NextRequest } from "next/server";
import { createSupabaseAuthedClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseAuthedClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ user: null });

  return Response.json({
    user: { id: user.id, email: user.email },
  });
}
