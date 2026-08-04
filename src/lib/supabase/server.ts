import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — Next.js forbids it.
            // Safe to ignore: middleware will refresh the cookies on the
            // next request instead.
          }
        },
      },
    },
  );
}

/**
 * Picks the right Supabase client for the incoming request:
 *
 *   - If `Authorization: Bearer <jwt>` is present (native iOS / future
 *     mobile clients), build a stateless client that carries the JWT in
 *     every PostgREST/Auth call. RLS policies see `auth.uid()` exactly as
 *     they do for cookie-based sessions.
 *   - Otherwise, fall back to the cookie-driven SSR client used by the web.
 *
 * Both clients expose the same surface (`.auth.getUser()`, `.from(...)…`),
 * so callers don't need to branch on the auth source.
 */
export async function createSupabaseAuthedClient(req: NextRequest) {
  const auth =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : null;

  if (!bearer) {
    return createSupabaseServerClient();
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    },
  );
}
