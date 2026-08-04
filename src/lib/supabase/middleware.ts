import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase session cookie on every request and (optionally)
 * redirect unauthenticated users to /login for app routes.
 *
 * Public routes (login flow, public assets, /api/trip/config, the landing
 * page) are allowed through without a session.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: don't put logic between createServerClient and getUser —
  // any auth.getUser/getSession is what actually refreshes the cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
