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

// Le détail de l'app, domaine par domaine (tout le texte est dans le HTML :
// c'est la page que les moteurs lisent pour les fonctionnalités). Même
// étudiant de démo que l'accueil, captures du 2026-10-13 (lib/siteShots.cjs).
//
// Pas six rangées interchangeables : chaque domaine est cadré selon ce qu'il
// montre — le Chrono et le mode Focus côte à côte, le Planning en grand, les
// Stats en panorama, la Progression dans le panneau vert de l'accueil, puis
// les amis et les espaces de cours sur deux téléphones.
const AREAS = [
  { id: "chrono", key: "chrono" },
  { id: "planning", key: "planning" },
  { id: "stats", key: "stats" },
  { id: "progression", key: "progression" },
  { id: "social", key: "social" },
  { id: "espaces-de-cours", key: "spaces" },
];

function Check() {
  return (
    <span className={sh.check} aria-hidden="true">
      <Glyph size={12}><polyline points="20 6 9 17 4 12" /></Glyph>
    </span>
  );
}

// Le titre, la phrase et les trois points d'un domaine.
function AreaText({ id, text, split = false }) {
  return (
    <div className={`${sh.areaText}${split ? ` ${sh.areaHeadSplit}` : ""}`}>
      <div>
        <h2 id={`${id}-title`} className={`${sh.areaTitle} ${s.display}`}>{text.title}</h2>
        <p className={sh.areaLead}>{text.text}</p>
      </div>
      <ul role="list" className={sh.points}>
        {text.points.map((point) => (
          <li key={point} className={sh.point}><Check />{point}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Features() {
  const { lang } = useI18n();
  const f = getLandingContent(lang).features;
  const area = (key) => f.areas[key];

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={sh.hero}>
          <div className={s.container}>
            <p className={s.eyebrow}>{f.eyebrow}</p>
            <h1 className={g.title}>{f.title}</h1>
            <p className={`${g.lead} ${sh.heroLead}`}>{f.lead}</p>
            <nav className={sh.index} aria-label={f.jump}>
              <ol role="list" className={sh.indexList}>
                {AREAS.map((item) => (
                  <li key={item.id} className={sh.indexItem}>
                    <a href={`#${item.id}`} className={sh.indexLink}>{area(item.key).title}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        <div className={`${s.container} ${sh.areasEnd}`}>
          {/* Chrono et mode Focus : deux états d'une même session. */}
          <section id="chrono" aria-labelledby="chrono-title" className={sh.area}>
            <AreaText id="chrono" text={area("chrono")} split />
            <div className={sh.pair}>
              <figure className={sh.figure}>
                <Shot lang={lang} name="feat-chrono" mobile="feat-chrono-mobile" alt={area("chrono").alt}
                  sizes="(min-width: 1120px) 516px, calc(50vw - 44px)" mobileSizes="calc(50vw - 26px)" className={sh.frame} />
              </figure>
              <figure className={sh.figure}>
                <Shot lang={lang} name="feat-focus" mobile="feat-focus-mobile" alt={area("chrono").focusAlt}
                  sizes="(min-width: 1120px) 516px, calc(50vw - 44px)" mobileSizes="calc(50vw - 26px)" className={sh.frame} />
              </figure>
            </div>
          </section>

          {/* Planning : le vrai Planning en grand, vue Mois. */}
          <section id="planning" aria-labelledby="planning-title" className={`${sh.area} ${sh.split}`}>
            <AreaText id="planning" text={area("planning")} />
            <figure className={sh.figure}>
              <Shot lang={lang} name="guide-planning-month" mobile="guide-planning-month-mobile" alt={area("planning").alt}
                sizes="(min-width: 1120px) 636px, (min-width: 1024px) calc(69vw - 82px), (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)"
                mobileSizes="min(460px, calc(100vw - 40px))" className={`${sh.frame} ${sh.screenCap}`} />
            </figure>
          </section>

          {/* Stats : l'écran en panorama, sous le texte. */}
          <section id="stats" aria-labelledby="stats-title" className={sh.area}>
            <AreaText id="stats" text={area("stats")} split />
            <figure className={sh.wideFigure}>
              <Shot lang={lang} name="guide-stats-overview" mobile="guide-stats-overview-mobile" alt={area("stats").alt}
                sizes="(min-width: 1120px) 1056px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)"
                mobileSizes="calc(100vw - 40px)" className={sh.frame} />
            </figure>
          </section>

          {/* Progression : le niveau, les missions et les défis, sur le vert
              clair de l'accueil. */}
          <section id="progression" aria-labelledby="progression-title" className={`${sh.area} ${sh.panelArea}`}>
            <AreaText id="progression" text={area("progression")} />
            <figure className={sh.panel}>
              <Shot lang={lang} name="guide-goals-progress" mobile="guide-goals-progress-mobile" alt={area("progression").alt}
                sizes="(min-width: 1120px) 480px, (min-width: 768px) min(592px, calc(100vw - 112px)), min(608px, calc(100vw - 72px))"
                mobileSizes="calc(100vw - 72px)" className={sh.frame} />
            </figure>
          </section>

          {/* Amis et espaces de cours : deux téléphones. */}
          <div className={`${sh.area} ${sh.duo}`}>
            {[["social", "social", "feat-social-phone"], ["espaces-de-cours", "spaces", "feat-spaces-phone"]].map(([id, key, shot]) => (
              <section key={id} id={id} aria-labelledby={`${id}-title`} className={`${sh.area} ${sh.duoItem}`}>
                <AreaText id={id} text={area(key)} />
                <div className={sh.phoneSlot}>
                  <div className={s.phone}>
                    <Shot lang={lang} name={shot} alt={area(key).alt} sizes="300px" className={s.phoneScreen} />
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>

        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
