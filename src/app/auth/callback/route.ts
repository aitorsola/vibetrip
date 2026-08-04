import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * Magic-link / OAuth callback. Supabase redirects here with `?code=...` after
 * the user clicks the email link. We exchange that code for a session cookie
 * and redirect to `next`, prefixed by the originating locale.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  const localeParam = url.searchParams.get("locale");
  const locale = (routing.locales as readonly string[]).includes(
    localeParam ?? "",
  )
    ? localeParam!
    : routing.defaultLocale;
  const origin = url.origin;

  // The "next" param may already include a locale (e.g. /es/trips). If it
  // doesn't, prepend the captured locale.
  const localePrefixedNext = (() => {
    if (next.startsWith("/")) {
      const seg = next.split("/")[1] ?? "";
      if ((routing.locales as readonly string[]).includes(seg)) return next;
    }
    if (next === "/") return `/${locale}`;
    return `/${locale}${next.startsWith("/") ? next : `/${next}`}`;
  })();

  if (!code) {
    return NextResponse.redirect(
      `${origin}/${locale}/login?error=missing_code`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/${locale}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${localePrefixedNext}`);
}
