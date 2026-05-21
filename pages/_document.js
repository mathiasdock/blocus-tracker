import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="fr">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
        {/* PWA */}
        {/* PWA meta tags are in _app.js via next/head */}
        <meta name="format-detection" content="telephone=no" />
      {/* Dark mode: apply class before first paint to avoid flash */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('bt_dark')==='true')document.documentElement.classList.add('dark')}catch(e){}})()` }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
