import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="fr">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* PWA */}
        {/* PWA meta tags are in _app.js via next/head */}
        <meta name="format-detection" content="telephone=no" />
      {/* Theme: apply class before first paint to avoid flash.
          bt_theme = "light" | "dark" | "system" (bt_dark is the legacy key,
          migrated on the fly). "system" follows prefers-color-scheme. */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('bt_theme');if(!t){t=localStorage.getItem('bt_dark')==='true'?'dark':'light';}var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()` }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
