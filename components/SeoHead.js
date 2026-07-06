import Head from "next/head";
import { useRouter } from "next/router";
import { BRAND_COLOR, SITE_AUTHOR, SITE_NAME, getSeoForPath, structuredDataForPath } from "../lib/seo";

function safeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function SeoHead() {
  const router = useRouter();
  const seo = getSeoForPath(router.pathname || "/");
  const jsonLd = structuredDataForPath(seo.path);

  return (
    <Head>
      <title>{seo.title}</title>
      <meta name="description" content={seo.description} />
      <meta name="robots" content={seo.robots} />
      <meta name="author" content={SITE_AUTHOR} />
      <meta name="theme-color" content={BRAND_COLOR} />
      <meta name="google-site-verification" content="mhpsTs_xVeQeT2qhnbJfEEV5IehHEAK6LHAUaFZDQ9U" />
      <link rel="canonical" href={seo.canonicalUrl} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={seo.title} />
      <meta property="og:description" content={seo.description} />
      <meta property="og:type" content={seo.type} />
      <meta property="og:url" content={seo.canonicalUrl} />
      <meta property="og:image" content={seo.image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Blocus Tracker, application d'étude pour étudiants" />
      <meta property="og:locale" content={seo.locale} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      <meta name="twitter:description" content={seo.description} />
      <meta name="twitter:image" content={seo.image} />
      <meta name="twitter:image:alt" content="Blocus Tracker, application d'étude pour étudiants" />

      {jsonLd.map((item, index) => (
        <script
          key={`${seo.canonicalPath}-jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(item) }}
        />
      ))}
    </Head>
  );
}
