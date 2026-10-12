import GuideArticle from "../components/landing/GuideArticle";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Guide sur le gabarit éditorial : les vrais graphiques de la page Stats en
// panorama, puis deux de ses cartes à côté de la liste des données à suivre.
export default function StatsEtude() {
  return <GuideArticle page={SEO_LANDING_PAGES["/stats-etude"]} layout="panorama" />;
}
