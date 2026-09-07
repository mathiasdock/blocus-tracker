import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="fr">
      <Head>
        {/* Polices : plus aucun appel a fonts.googleapis.com / fonts.gstatic.com.
            Elles sont servies depuis /fonts (voir styles/globals.css et
            public/fonts/README.md) — aucun tiers ne reçoit donc l'IP d'un
            visiteur au simple chargement d'une page. */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/nunito-sans-latin.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/quicksand-latin.woff2" crossOrigin="anonymous" />
        {/* PWA */}
        {/* PWA meta tags are in _app.js via next/head */}
        <meta name="format-detection" content="telephone=no" />
      {/* Theme: apply class before first paint to avoid flash.
          bt_theme = "light" | "dark" | "system" (bt_dark is the legacy key,
          migrated on the fly). "system" follows prefers-color-scheme, but the
          default when nothing is set is "light" (not the OS preference) —
          an iPhone in dark mode must not silently dark-theme the app. */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('bt_theme');if(!t){var l=localStorage.getItem('bt_dark');t=l==='true'?'dark':'light';}var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()` }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
