import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createIntlMiddleware(routing);

// Pages reachable without a session, expressed without the locale prefix.
const PUBLIC_PAGES = ["/", "/login", "/shared"];
// API endpoints reachable without a session. The middleware only does
// cookie-based auth; Bearer-token clients (iOS) would always be rejected
// here. Endpoints listed below skip the middleware check and enforce auth
// themselves via `createSupabaseAuthedClient` (cookie OR Bearer).
const PUBLIC_API = [
  "/api/trip/config",
  "/api/auth/me",
  "/api/trip/plan",
  "/api/chat",
  "/api/llm/validate",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth callback / logout never get localized — they're called by the
  // browser following a Supabase magic-link or an explicit POST.
  if (pathname.startsWith("/auth/")) {
    return NextResponse.next();
  }

  // API routes: no i18n, only auth gating where needed.
  if (pathname.startsWith("/api/")) {
    return handleApiAuth(request);
  }

  // Pages: localize first, then layer auth on top of the response so
  // Supabase cookies and next-intl cookies coexist.
  const response = handleI18nRouting(request);

  // If next-intl decided to redirect (e.g. "/" → "/es") respect it as is.
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  // Refresh Supabase session on the same response object. The setAll
  // callback writes the rotated auth cookies onto next-intl's response so
  // both layers stay consistent.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Strip the locale prefix to compare against PUBLIC_PAGES.
  const match = pathname.match(/^\/([a-z]{2})(\/.*|$)/);
  const locale = match?.[1] ?? routing.defaultLocale;
  const stripped = match?.[2] || "/";
  const isPublic = PUBLIC_PAGES.some(
    (p) => stripped === p || stripped.startsWith(`${p}/`),
  );

  if (user || isPublic) {
    return response;
  }

  // Authenticated route hit by an anonymous user → bounce to /[locale]/login.
  const loginUrl = new URL(`/${locale}/login`, request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

async function handleApiAuth(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_API.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user || isPublic) return response;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, favicon
     * - public assets (images)
     * - .well-known/* — Apple Universal Links AASA must be served raw,
     *   without locale redirects (Apple's CDN does not follow redirects).
     */
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
