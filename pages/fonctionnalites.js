import Glyph from "../components/Glyph";
import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import FinalCta from "../components/landing/FinalCta";
import Shot from "../components/landing/Shot";
import s from "../components/landing/Landing.module.css";
import { useI18n } from "../contexts/I18nContext";
import { getLandingContent } from "../lib/landingContent";

// Le détail de l'app, domaine par domaine, en sections empilées (tout le
// texte est dans le HTML : c'est la page que les moteurs lisent pour les
// fonctionnalités). Même étudiant de démo que l'accueil.
const AREAS = [
  { id: "chrono", key: "chrono", shot: "chrono-desktop", mobile: "chrono-mobile" },
  { id: "planning", key: "planning", shot: "planning-desktop", mobile: "planning-mobile" },
  { id: "stats", key: "stats", shot: "stats-desktop" },
  { id: "progression", key: "progression", phone: "progression-mobile" },
  { id: "social", key: "social", shot: "social-desktop" },
  { id: "espaces-de-cours", key: "spaces", shot: "spaces-desktop", mobile: "spaces-mobile" },
];

export default function Features() {
  const { lang } = useI18n();
  const f = getLandingContent(lang).features;

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={s.pageHero}>
          <div className={s.container}>
            <p className={s.eyebrow}>{f.eyebrow}</p>
            <h1 className={s.pageTitle}>{f.title}</h1>
            <p className={s.pageLead}>{f.lead}</p>
            <nav className={s.jump} aria-label={f.jump}>
              {AREAS.map((area) => (
                <a key={area.id} href={`#${area.id}`} className={s.jumpLink}>{f.areas[area.key].title}</a>
              ))}
            </nav>
          </div>
        </section>

        <div className={s.container}>
          {AREAS.map((area, index) => {
            const text = f.areas[area.key];
            return (
              <section key={area.id} id={area.id} aria-labelledby={`${area.id}-title`}
                className={`${s.featureRow} ${index % 2 ? s.featureRowFlip : ""}`}>
                <div>
                  <h2 id={`${area.id}-title`} className={`${s.featureTitle} ${s.display}`}>{text.title}</h2>
                  <p className={s.featureText}>{text.text}</p>
                  <ul className={s.points}>
                    {text.points.map((point) => (
                      <li key={point} className={s.point}>
                        <span className={s.pointMark} aria-hidden="true">
                          <Glyph size={12}><polyline points="20 6 9 17 4 12" /></Glyph>
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={s.featureMedia}>
                  {area.phone ? (
                    <div className={s.phone}>
                      <Shot lang={lang} name={area.phone} alt={text.alt} sizes="300px" className={s.phoneScreen} />
                    </div>
                  ) : (
                    <Shot lang={lang} name={area.shot} mobile={area.mobile} alt={text.alt}
                      sizes="(min-width: 1120px) 640px, (min-width: 960px) 56vw, 92vw" mobileSizes={area.mobile ? "76vw" : "92vw"}
                      className={`${s.shotFrame} ${area.mobile ? s.hasMobile : ""}`} />
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
