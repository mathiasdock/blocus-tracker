import Link from "next/link";
import Glyph from "../components/Glyph";
import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import FinalCta from "../components/landing/FinalCta";
import Shot from "../components/landing/Shot";
import s from "../components/landing/Landing.module.css";
import g from "../components/landing/Guide.module.css";
import sh from "../components/landing/Showcase.module.css";
import { useI18n } from "../contexts/I18nContext";
import { getLandingContent } from "../lib/landingContent";
import { SEO_LANDING_PAGES, SEO_LANDING_PATHS } from "../lib/seoLandingPages";
import { SEO_LANDING_PAGES_EN } from "../lib/seoLandingPagesEn";

// Sommaire des guides : la méthode en quatre temps, où chaque temps mène au
// guide qui l'outille, puis les six guides, chacun avec une vraie capture du
// produit dont il parle — pour choisir d'un coup d'œil.
function Arrow() {
  return <Glyph size={16}><path d="M5 12h14M13 6l6 6-6 6" /></Glyph>;
}

// Le dernier mot passe à la ligne avec la flèche : jamais de flèche seule.
function LinkText({ text }) {
  const cut = text.lastIndexOf(" ") + 1;
  return <>{text.slice(0, cut)}<span className={sh.keep}>{text.slice(cut)} <Arrow /></span></>;
}

// La vignette de chaque guide (lib/siteShots.cjs, « thumb-* »), décorative :
// le titre du lien suffit à le nommer.
const THUMBS = {
  "/pomodoro": { center: true },
  "/stats-etude": { left: true },
};

export default function Guides() {
  const { lang } = useI18n();
  const c = getLandingContent(lang).guidesPage;

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={sh.hero}>
          <div className={s.container}>
            <p className={s.eyebrow}>{c.eyebrow}</p>
            <h1 className={g.title}>{c.title}</h1>
            <p className={`${g.lead} ${sh.heroLead}`}>{c.lead}</p>
          </div>
        </section>

        <section className={sh.loopSection} aria-labelledby="method-title">
          <div className={s.container}>
            <div className={sh.sectionHead}>
              <h2 id="method-title" className={`${sh.h2} ${s.display}`}>{c.methodTitle}</h2>
              <p className={sh.sectionText}>{c.methodText}</p>
            </div>
            <ol className={sh.loop}>
              {c.steps.map((step, index) => (
                <li key={step.href} className={sh.loopStep}>
                  <span className={sh.loopNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div className={sh.loopBody}>
                    <h3 className={sh.loopTitle}>{step.title}</h3>
                    <p className={sh.loopText}>{step.text}</p>
                    <p className={sh.loopLink}>
                      <Link href={step.href} className={s.textLink}><LinkText text={step.link} /></Link>
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={sh.indexSection} aria-labelledby="all-guides-title">
          <div className={s.container}>
            <h2 id="all-guides-title" className={`${sh.h2} ${s.display}`}>{c.allTitle}</h2>
            <ul role="list" className={sh.guideIndex}>
              {SEO_LANDING_PATHS.map((path) => {
                const page = lang === "en" ? { ...SEO_LANDING_PAGES[path], ...SEO_LANDING_PAGES_EN[path] } : SEO_LANDING_PAGES[path];
                const thumb = THUMBS[path] || {};
                return (
                  <li key={path} className={sh.guideItem}>
                    <Link href={path} className={sh.guideEntry}>
                      <Shot lang={lang} name={`thumb${path.replace("/", "-")}`} alt="" sizes="(min-width: 640px) 176px, 112px"
                        className={`${sh.guideThumb}${thumb.center ? ` ${sh.guideThumbCenter}` : ""}${thumb.left ? ` ${sh.guideThumbLeft}` : ""}`} />
                      <span className={sh.guideEyebrow}>{page.eyebrow}</span>
                      <h3 className={sh.guideTitle}>{page.h1}</h3>
                      <p className={sh.guideText}>{c.cards[path]}</p>
                      <span className={sh.guideMore}>{c.read} <Arrow /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
