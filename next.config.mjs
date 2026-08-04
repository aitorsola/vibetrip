import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes is incompatible with next-intl's [locale] segment generic
  // route types, so we drop it. Internal links use the localized helper from
  // src/i18n/routing instead.
  async headers() {
    return [
      {
        // Apple's CDN fetches this file before installing/updating the app
        // and validates the JSON against the iOS bundle's Associated
        // Domains entitlement. It must be served with a JSON Content-Type
        // and without redirects.
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
