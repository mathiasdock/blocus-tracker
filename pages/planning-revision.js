import GuideArticle from "../components/landing/GuideArticle";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Premier guide sur le gabarit éditorial (pilote de la refonte du site
// public) ; les autres guides restent sur SeoLandingPage pour l'instant.
export default function PlanningRevision() {
  return <GuideArticle page={SEO_LANDING_PAGES["/planning-revision"]} />;
}
