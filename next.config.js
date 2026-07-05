const nextPwa = require("@ducanh2912/next-pwa");
const withPWA = nextPwa.default;
// Tableau runtimeCaching par défaut de next-pwa (fonts, assets statiques, pages…).
// On le conserve intégralement et on préfixe notre règle Supabase devant.
const defaultRuntimeCaching = nextPwa.runtimeCaching || [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : "*.supabase.co";
    const supabaseHttps = `https://${supabaseHost}`;
    const supabaseWss = `wss://${supabaseHost}`;
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "script-src 'self' 'unsafe-inline' https://cdn.onesignal.com https://onesignal.com https://*.onesignal.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${supabaseHttps}`,
      `media-src 'self' blob: ${supabaseHttps}`,
      `connect-src 'self' ${supabaseHttps} ${supabaseWss} https://api.onesignal.com https://onesignal.com https://*.onesignal.com`,
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

// ── Supabase Storage : CacheFirst ───────────────────────────────────────────
// Sert les images Supabase (avatars, posts, dm, community) DEPUIS LE CACHE sans
// refetch réseau systématique. C'est ce qui réduit le cached egress : la règle
// image par défaut de next-pwa est StaleWhileRevalidate (revalidation réseau à
// chaque vue) → ici on coupe la revalidation.
//
// Safe : chaque upload produit une URL unique (Date.now()) → un nouvel avatar /
// nouvelle photo = nouvelle URL = cache miss = fetch frais. Aucun risque d'image
// figée. Placée AVANT la règle image générique pour matcher en priorité.
const supabaseStorageCache = {
  urlPattern: ({ url }) => url.pathname.includes("/storage/v1/object/public/"),
  handler: "CacheFirst",
  options: {
    cacheName: "supabase-storage",
    expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 jours
    cacheableResponse: { statuses: [0, 200] },
  },
};

module.exports = withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [supabaseStorageCache, ...defaultRuntimeCaching],
  },
})(nextConfig);
