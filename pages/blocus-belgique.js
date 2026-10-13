import GuideArticle from "../components/landing/GuideArticle";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Guide sur le gabarit éditorial, en article : la définition à côté de
// l'introduction, la journée type sur un fil, les sources en note de bas de
// page.
export default function BlocusBelgique() {
  return <GuideArticle page={SEO_LANDING_PAGES["/blocus-belgique"]} layout="article" />;
}
