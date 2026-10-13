import GuideArticle from "../components/landing/GuideArticle";
import PublicChrono from "../components/timer/PublicChrono";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

// Le guide Pomodoro, avec le vrai Chrono utilisable sur place (P1-B phase 2),
// sur le gabarit éditorial des guides (composition « tool »).
// Le Chrono est le seul élément qui suit le tic du minuteur : l'article ne se
// redessine pas à chaque demi-seconde.
export default function Pomodoro() {
  return <GuideArticle page={SEO_LANDING_PAGES["/pomodoro"]} layout="tool" tool={<PublicChrono />} />;
}
