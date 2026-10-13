import GuideArticle from "../components/landing/GuideArticle";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Premier guide passé au gabarit éditorial (pilote de la refonte du site
// public) : l'introduction et le vrai Planning côte à côte.
export default function PlanningRevision() {
  return <GuideArticle page={SEO_LANDING_PAGES["/planning-revision"]} />;
}
