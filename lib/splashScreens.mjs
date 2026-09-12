// Écrans de lancement iOS — la liste des appareils, en un seul endroit.
//
// iOS n'accepte un `apple-touch-startup-image` que si ses dimensions
// correspondent EXACTEMENT à l'écran. Un pixel d'écart et l'image est ignorée :
// l'app démarre sur un fond blanc. Cette liste est donc la source unique dont
// se servent à la fois le générateur d'images (scripts/generate-splash.mjs) et
// les balises <link> de _app.js — deux listes finiraient par diverger, et la
// divergence se verrait sous la forme d'un flash blanc sur un seul modèle.
//
// `w` / `h` sont les dimensions CSS en PORTRAIT. iOS garde ces mêmes valeurs
// pour `device-width` / `device-height` même quand l'appareil est en paysage —
// c'est l'écran physique qu'elles décrivent, pas l'orientation courante. Seules
// les dimensions de l'IMAGE s'inversent.

export const APPLE_SPLASH_DEVICES = [
  // ── iPhone ────────────────────────────────────────────────
  { w: 320, h: 568, dpr: 2, name: "iPhone SE (1re gen), 5s" },
  { w: 375, h: 667, dpr: 2, name: "iPhone 6/7/8, SE 2e et 3e gen" },
  { w: 414, h: 736, dpr: 3, name: "iPhone 6+/7+/8+" },
  { w: 375, h: 812, dpr: 3, name: "iPhone X/XS, 11 Pro, 12 mini, 13 mini" },
  { w: 414, h: 896, dpr: 2, name: "iPhone XR, 11" },
  { w: 414, h: 896, dpr: 3, name: "iPhone XS Max, 11 Pro Max" },
  { w: 390, h: 844, dpr: 3, name: "iPhone 12/12 Pro, 13/13 Pro, 14" },
  { w: 428, h: 926, dpr: 3, name: "iPhone 12/13 Pro Max, 14 Plus" },
  { w: 393, h: 852, dpr: 3, name: "iPhone 14 Pro, 15/15 Pro, 16" },
  { w: 430, h: 932, dpr: 3, name: "iPhone 14 Pro Max, 15 Plus/Pro Max, 16 Plus" },
  { w: 402, h: 874, dpr: 3, name: "iPhone 16 Pro" },
  { w: 440, h: 956, dpr: 3, name: "iPhone 16 Pro Max" },

  // ── iPad ──────────────────────────────────────────────────
  { w: 744, h: 1133, dpr: 2, name: "iPad mini 6" },
  { w: 768, h: 1024, dpr: 2, name: "iPad 9.7, mini, Air" },
  { w: 810, h: 1080, dpr: 2, name: "iPad 10.2" },
  { w: 820, h: 1180, dpr: 2, name: "iPad Air 10.9, iPad 10e gen" },
  { w: 834, h: 1112, dpr: 2, name: "iPad Pro 10.5, Air 10.5" },
  { w: 834, h: 1194, dpr: 2, name: "iPad Pro 11" },
  { w: 1024, h: 1366, dpr: 2, name: "iPad Pro 12.9" },
];

// Le logo occupe une part du CÔTÉ LE PLUS COURT, pas de la largeur : sur un
// iPhone en paysage, se caler sur la largeur donnerait un logo qui déborde en
// hauteur. Plafonné pour qu'il reste un point de marque sur iPad et non une
// illustration pleine page.
export const SPLASH_LOGO_RATIO = 0.52;
export const SPLASH_LOGO_MAX = 280;

export const SPLASH_BACKGROUND = "#14B885";

/** Taille du logo en pixels CSS pour un écran donné. */
export function splashLogoSize(cssW, cssH) {
  return Math.round(Math.min(Math.min(cssW, cssH) * SPLASH_LOGO_RATIO, SPLASH_LOGO_MAX));
}

/** Les entrées à générer / déclarer : chaque appareil dans les deux sens. */
export function appleSplashEntries() {
  const entries = [];
  for (const device of APPLE_SPLASH_DEVICES) {
    for (const orientation of ["portrait", "landscape"]) {
      const portrait = orientation === "portrait";
      const cssW = portrait ? device.w : device.h;
      const cssH = portrait ? device.h : device.w;
      entries.push({
        ...device,
        orientation,
        cssW,
        cssH,
        pxW: cssW * device.dpr,
        pxH: cssH * device.dpr,
        href: `/splash/apple-splash-${cssW * device.dpr}x${cssH * device.dpr}.png`,
        // `device-width` / `device-height` restent les valeurs PORTRAIT.
        media:
          `(device-width: ${device.w}px) and (device-height: ${device.h}px) ` +
          `and (-webkit-device-pixel-ratio: ${device.dpr}) ` +
          `and (orientation: ${orientation})`,
      });
    }
  }
  return entries;
}
