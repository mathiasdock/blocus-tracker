const nextPwa = require("@ducanh2912/next-pwa");
const withPWA = nextPwa.default;
// Tableau runtimeCaching par défaut de next-pwa (fonts, assets statiques, pages…).
// On le conserve intégralement et on préfixe notre règle Supabase devant.
const defaultRuntimeCaching = nextPwa.runtimeCaching || [];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
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
