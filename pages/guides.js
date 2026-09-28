import Link from "next/link";
import Glyph from "../components/Glyph";
import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import FinalCta from "../components/landing/FinalCta";
import s from "../components/landing/Landing.module.css";
import { useI18n } from "../contexts/I18nContext";
import { getLandingContent } from "../lib/landingContent";
import { SEO_LANDING_PAGES, SEO_LANDING_PATHS } from "../lib/seoLandingPages";
import { SEO_LANDING_PAGES_EN } from "../lib/seoLandingPagesEn";

// Sommaire des guides : la méthode en quatre temps (autrefois sur l'accueil),
// puis les six guides, chacun à un clic.
function Arrow() {
  return <Glyph size={16}><path d="M5 12h14M13 6l6 6-6 6" /></Glyph>;
}

export default function Guides() {
  const { lang } = useI18n();
  const g = getLandingContent(lang).guidesPage;

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={s.pageHero}>
          <div className={s.container}>
            <p className={s.eyebrow}>{g.eyebrow}</p>
            <h1 className={s.pageTitle}>{g.title}</h1>
            <p className={s.pageLead}>{g.lead}</p>
          </div>
        </section>

        <section className={s.section} aria-labelledby="method-title">
          <div className={s.container}>
            <h2 id="method-title" className={`${s.h2} ${s.display}`}>{g.methodTitle}</h2>
            <p className={s.sectionLead}>{g.methodText}</p>
            <ol className={s.steps}>
              {g.steps.map((step, index) => (
                <li key={step.href} className={s.step}>
                  <span className={s.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className={s.stepTitle}>{step.title}</h3>
                    <p className={s.stepText}>{step.text}</p>
                    <Link href={step.href} className={s.textLink}>{step.link} <Arrow /></Link>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={s.section} style={{ paddingTop: 0 }} aria-labelledby="all-guides-title">
          <div className={s.container}>
            <h2 id="all-guides-title" className={`${s.h2} ${s.display}`}>{g.allTitle}</h2>
            <div className={s.guideGrid}>
              {SEO_LANDING_PATHS.map((path) => {
                const page = lang === "en" ? { ...SEO_LANDING_PAGES[path], ...SEO_LANDING_PAGES_EN[path] } : SEO_LANDING_PAGES[path];
                return (
                  <Link key={path} href={path} className={s.guideCard}>
                    <span className={s.guideEyebrow}>{page.eyebrow}</span>
                    <h3 className={s.guideTitle}>{page.h1}</h3>
                    <p className={s.guideText}>{g.cards[path]}</p>
                    <span className={s.guideMore}>{g.read} <Arrow /></span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
