import SeoLandingPage from "../components/SeoLandingPage";
import { SEO_LANDING_PAGES } from "../lib/seoLandingPages";

export default function Pomodoro() {
  return <SeoLandingPage page={SEO_LANDING_PAGES["/pomodoro"]} />;
}
