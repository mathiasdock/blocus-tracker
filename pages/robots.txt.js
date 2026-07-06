import { absoluteUrl } from "../lib/seo";

function buildRobots() {
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${absoluteUrl("/sitemap.xml")}
`;
}

export async function getServerSideProps({ res }) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.write(buildRobots());
  res.end();
  return { props: {} };
}

export default function Robots() {
  return null;
}
