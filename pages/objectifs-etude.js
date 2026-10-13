import GuideArticle from "../components/landing/GuideArticle";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Guide sur le gabarit éditorial : la progression réelle (missions du jour,
// défis de la semaine, niveau) dans un panneau, à côté de l'introduction.
export default function ObjectifsEtude() {
  return <GuideArticle page={SEO_LANDING_PAGES["/objectifs-etude"]} layout="panel" />;
}
