import GuideArticle from "../components/landing/GuideArticle";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Guide sur le gabarit éditorial : le vrai Chrono sur ordinateur et téléphone
// en haut, puis une vraie capture pour chaque fonction de l'encadré.
export default function ApplicationEtudiant() {
  return <GuideArticle page={SEO_LANDING_PAGES["/application-etudiant"]} layout="devices" />;
}
