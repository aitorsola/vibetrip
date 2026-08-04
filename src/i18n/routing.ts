import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["es", "en", "fr", "de", "it", "pt"] as const,
  defaultLocale: "es",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

// Drop-in replacements for next/link, next/navigation that automatically
// preserve the active locale. Import from here instead of next/*.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
