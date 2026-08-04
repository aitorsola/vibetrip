import type { ReactNode } from "react";

// The real layout (html/body, providers, Navbar) lives in
// app/[locale]/layout.tsx so we can read the active locale from the URL.
// This passthrough is required because Next.js mandates a root layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
