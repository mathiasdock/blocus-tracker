import { SEO_INDEXABLE_ROUTES, absoluteUrl, getSeoForPath } from "../lib/seo";

function buildLlmsTxt() {
  const publicPages = SEO_INDEXABLE_ROUTES
    .map((route) => {
      const seo = getSeoForPath(route.path);
      return `- ${absoluteUrl(route.path)} — ${seo.title}. ${seo.description}`;
    })
    .join("\n");

  return `# Blocus Tracker

Blocus Tracker is a web application for students who want to time study sessions, plan revisions, track progress, and stay motivated with friends during exam periods.

## Canonical Site

${absoluteUrl("/")}

## Public Pages For Search And AI Assistants

${publicPages}

## Main Product Concepts

- Study timer and Pomodoro-style focus sessions.
- Revision planning for courses, objectives, and exams.
- Study statistics, streaks, XP, badges, and progress tracking.
- Optional social features for friends, groups, and student communities.
- Privacy-first account features: personal study data is not intended for public indexing.
- Public French guides for Pomodoro, revision planning, study statistics, study goals, student productivity apps, and Belgian blocus preparation.

## Crawl Guidance

The public marketing, demo, and legal pages are intended for indexing. Authenticated app areas, user profiles, private messages, admin tools, and API routes should not be treated as public knowledge sources.

## Structured Data

The public site exposes Schema.org JSON-LD for SoftwareApplication, Organization, WebSite, FAQPage, WebPage, and BreadcrumbList where relevant.
`;
}

export async function getServerSideProps({ res }) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.write(buildLlmsTxt());
  res.end();
  return { props: {} };
}

export default function LlmsTxt() {
  return null;
}
