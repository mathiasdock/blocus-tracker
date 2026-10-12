import Link from "next/link";
import Glyph from "../Glyph";
import Mascot from "../Mascot";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";
import Shot from "./Shot";
import s from "./Landing.module.css";
import g from "./Guide.module.css";
import { useI18n } from "../../contexts/I18nContext";
import { SEO_LANDING_PAGES_EN } from "../../lib/seoLandingPagesEn";

// Gabarit éditorial des guides, sur la grammaire de l'accueil : même en-tête,
// même grille, mêmes boutons et même appel final (Landing.module.css).
// /planning-revision (pilote), /stats-etude et /objectifs-etude ; chaque guide
// choisit sa composition (LAYOUT ci-dessous) selon ce qu'il montre du produit.
// Les autres guides gardent SeoLandingPage jusqu'à leur propre passage.
//
// Le texte, les titres et les liens sont ceux de lib/seoLandingPages(.En).js,
// mot pour mot : seule la mise en page change. Meta et JSON-LD restent dans
// SeoHead (lib/seo.js). La langue suit la même règle que SeoLandingPage :
// français pour tout visiteur non connecté, anglais sur choix manuel ou pour
// un compte anglophone (I18nContext).
//
// Peu de surfaces, chacune pour une raison : les vraies captures du produit,
// l'encadré « dans Blocus Tracker » à côté de l'article et l'appel final. Le
// reste tient par l'espace, les filets et la typographie.

// Chaînes de la coquille, reprises telles quelles de SeoLandingPage (même texte
// visible). Elles partiront avec lui, une fois le dernier guide migré.
const UI = {
  fr: {
    included: "Inclus",
    shortAnswer: "Réponse courte",
    createSpace: "Créer mon espace",
    relatedTitle: "Continuer intelligemment",
    relatedText: "Ces guides sont liés entre eux pour construire un vrai système de révision : méthode, planning, objectifs, suivi et motivation.",
    faqTitle: "Questions fréquentes",
    faqText: "Des réponses directes pour t'aider à choisir une méthode et un outil sans perdre une soirée à comparer.",
    finalTitle: "Passe de l'intention à une vraie session.",
    finalText: "Tu peux tester le chrono tout de suite. Crée un compte quand tu veux sauvegarder ton planning, tes statistiques et ta progression.",
    startTimer: "Lancer le chrono",
    signup: "Créer un compte",
  },
  en: {
    included: "Included",
    shortAnswer: "Short answer",
    createSpace: "Create my space",
    relatedTitle: "Keep going, smartly",
    relatedText: "These guides connect to build a real revision system: method, planning, goals, tracking and motivation.",
    faqTitle: "Frequently asked questions",
    faqText: "Direct answers to help you choose a method and a tool without losing an evening comparing.",
    finalTitle: "Go from intention to a real session.",
    finalText: "You can try the timer right now. Create an account when you want to save your plan, your stats and your progress.",
    startTimer: "Start the timer",
    signup: "Create an account",
  },
};

// Typographie française à l'affichage : une espace insécable avant « ? ! : ; »
// et après « « », pour qu'un signe ne parte jamais seul à la ligne. Les
// chaînes de lib/seoLandingPages.js — et le JSON-LD qui les lit — ne changent
// pas.
const NBSP = "\u00A0";
function typeset(value) {
  if (typeof value === "string") return value.replace(/ ([?!:;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
  if (Array.isArray(value)) return value.map(typeset);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeset(v)]));
  return value;
}
const UI_FR = typeset(UI.fr);

function Arrow() {
  return <Glyph size={16}><path d="M5 12h14M13 6l6 6-6 6" /></Glyph>;
}

function Check() {
  return (
    <span className={g.check} aria-hidden="true">
      <Glyph size={12}><polyline points="20 6 9 17 4 12" /></Glyph>
    </span>
  );
}

// Une liste de section : numérotée quand ce sont des étapes, à filets sinon.
function SectionList({ section }) {
  if (!section.bullets?.length) return null;
  const ordered = section.ordered === true;
  const List = ordered ? "ol" : "ul";
  return (
    // role="list" : Safari retire la sémantique de liste à une liste sans
    // puces natives.
    <List role="list" className={ordered ? g.steps : g.bullets}>
      {section.bullets.map((item) => (
        <li key={item} className={ordered ? g.step : g.bullet}>{item}</li>
      ))}
    </List>
  );
}

// La composition du haut de page, choisie par chaque guide selon ce qu'il
// montre du produit :
// - "screen" : l'introduction et un écran de l'app côte à côte (Planning) ;
// - "panorama" : l'introduction et la réponse courte côte à côte, puis un
//   écran en grand sur toute la largeur (Stats : les graphiques) ;
// - "panel" : la capture dans un panneau vert, à gauche de l'introduction
//   (Objectifs : la progression).
const LAYOUT = {
  screen: { className: "", sizes: "(min-width: 1120px) 550px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)", mobileSizes: "calc(100vw - 40px)" },
  panorama: { className: g.layoutPanorama, sizes: "(min-width: 1120px) 1056px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)", mobileSizes: "calc(100vw - 40px)" },
  panel: { className: g.layoutPanel, sizes: "(min-width: 1120px) 520px, (min-width: 768px) min(592px, calc(100vw - 112px)), min(608px, calc(100vw - 72px))", mobileSizes: "calc(100vw - 72px)" },
};

export default function GuideArticle({ page, layout = "screen" }) {
  const { lang } = useI18n();
  const isEn = lang === "en";
  const ui = isEn ? UI.en : UI_FR;
  const en = isEn ? SEO_LANDING_PAGES_EN[page.path] : null;
  const p = en ? { ...page, ...en } : typeset(page);
  const composition = LAYOUT[layout] || LAYOUT.screen;
  // La version anglaise ne redéclare que les textes alternatifs des captures :
  // les noms des captures et la forme des listes viennent de la version
  // française, section par section.
  const shot = page.productShot ? { ...(isEn ? page.productShot : p.productShot), ...(en?.productShot || {}) } : null;
  const sections = !en ? p.sections : p.sections.map((section, index) => {
    const fr = page.sections[index] || {};
    return {
      ...section,
      ordered: section.ordered ?? fr.ordered,
      figures: fr.figures?.map((figure, k) => ({ ...figure, ...(section.figures?.[k] || {}) })),
    };
  });
  // Une première section illustrée (Stats : les données à suivre et leurs
  // vraies cartes) prend toute la largeur, avant la colonne de lecture.
  const wide = sections[0]?.figures?.length ? sections[0] : null;
  const prose = wide ? sections.slice(1) : sections;
  const offset = wide ? 1 : 0;

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />

      <main>
        <article>
          {/* Grand écran : le titre sur toute la largeur, puis l'introduction
              et la vraie capture côte à côte, la réponse courte en dessous.
              Téléphone et tablette : titre, introduction, réponse courte, puis
              la capture — la réponse arrive avant l'image. */}
          <div className={g.top}>
            <div className={`${s.container} ${g.topGrid} ${shot ? "" : g.topSolo}${composition.className ? ` ${composition.className}` : ""}`}>
              <header className={g.intro}>
                <p className={s.eyebrow}>{p.eyebrow}</p>
                <h1 className={g.title}>{p.h1}</h1>
              </header>

              <div className={g.copy}>
                <p className={g.lead}>{p.lead}</p>
                <div className={`${s.actions} ${g.heroActions}`}>
                  <Link href="/dashboard" className={`btn-primary ${s.cta}`}>{p.ctaLabel}</Link>
                  <Link href={p.secondaryCtaHref} className={`btn-ghost ${s.cta} ${s.ctaGhost}`}>
                    {p.secondaryCtaLabel}
                  </Link>
                </div>
                <dl className={g.included}>
                  <dt className={g.includedLabel}>{ui.included}</dt>
                  {p.proofPoints.map((point) => (
                    <dd key={point} className={g.includedItem}><Check />{point}</dd>
                  ))}
                </dl>
              </div>

              <section className={g.answer} aria-labelledby="guide-answer-title">
                <h2 id="guide-answer-title" className={`${g.answerTitle} ${s.display}`}>{ui.shortAnswer}</h2>
                <p className={g.answerText}>{p.shortAnswer}</p>
              </section>

              {shot && (
                <figure className={g.figure}>
                  <Shot
                    lang={lang}
                    name={shot.name}
                    mobile={shot.mobile}
                    alt={shot.alt}
                    priority
                    sizes={composition.sizes}
                    mobileSizes={composition.mobileSizes}
                    className={layout === "screen" ? g.screen : g.frame}
                  />
                </figure>
              )}
            </div>
          </div>

          {wide && (
            <section className={`${s.container} ${g.wide}`} aria-labelledby="guide-section-1">
              <div className={g.wideText}>
                <h2 id="guide-section-1" className={`${g.h2} ${s.display}`}>{wide.title}</h2>
                {wide.body.map((paragraph) => (
                  <p key={paragraph} className={g.paragraph}>{paragraph}</p>
                ))}
                <SectionList section={wide} />
              </div>
              {wide.figures.map((figure, k) => (
                <figure key={figure.name} className={k === 0 ? g.wideSide : g.wideFull}>
                  <Shot
                    lang={lang}
                    name={figure.name}
                    mobile={figure.mobile}
                    alt={figure.alt}
                    sizes={k === 0 ? "(min-width: 1024px) 420px, calc(100vw - 40px)" : "(min-width: 1120px) 1056px, (min-width: 768px) calc(100vw - 64px), calc(100vw - 40px)"}
                    mobileSizes="calc(100vw - 40px)"
                    className={g.frame}
                  />
                </figure>
              ))}
            </section>
          )}

          {/* L'article dans une colonne de lecture ; à côté, sur ordinateur,
              ce que l'app fait du sujet, qui suit la lecture sous l'en-tête. */}
          <div className={`${s.container} ${g.body}`}>
            <div className={g.prose}>
              {prose.map((section, index) => {
                const id = `guide-section-${index + 1 + offset}`;
                return (
                  <section key={section.title} aria-labelledby={id}>
                    <h2 id={id} className={`${g.h2} ${s.display}`}>{section.title}</h2>
                    {section.body.map((paragraph) => (
                      <p key={paragraph} className={g.paragraph}>{paragraph}</p>
                    ))}
                    <SectionList section={section} />
                  </section>
                );
              })}
            </div>

            <aside className={g.aside} aria-labelledby="guide-panel-title">
              <div className={g.panel}>
                <h2 id="guide-panel-title" className={`${g.panelTitle} ${s.display}`}>{p.featurePanel.title}</h2>
                <ul role="list" className={g.panelList}>
                  {p.featurePanel.items.map((item) => (
                    <li key={item} className={g.panelItem}><Check />{item}</li>
                  ))}
                </ul>
                <Link href="/signup" className={`${s.textLink} ${g.panelLink}`}>
                  {ui.createSpace} <Arrow />
                </Link>
              </div>
            </aside>
          </div>

          <section className={g.related} aria-labelledby="guide-related-title">
            <div className={s.container}>
              <h2 id="guide-related-title" className={`${g.h2} ${s.display}`}>{ui.relatedTitle}</h2>
              <p className={g.sectionText}>{ui.relatedText}</p>
              <ul role="list" className={g.relatedList}>
                {p.related.map((item) => (
                  <li key={item.href} className={g.relatedItem}>
                    <Link href={item.href} className={g.relatedLink}>
                      <h3 className={g.relatedTitle}>{item.label}</h3>
                      <p className={g.relatedText}>{item.text}</p>
                      <span className={g.relatedArrow} aria-hidden="true"><Arrow /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Réponses visibles d'emblée, comme sur /faq : ce sont celles du
              JSON-LD FAQPage. */}
          <section className={g.faqSection} aria-labelledby="guide-faq-title">
            <div className={`${s.container} ${g.faq}`}>
              <div>
                <h2 id="guide-faq-title" className={`${g.h2} ${s.display}`}>{ui.faqTitle}</h2>
                <p className={g.sectionText}>{ui.faqText}</p>
              </div>
              <div>
                {p.faq.map((item) => (
                  <section key={item.q} className={g.faqItem}>
                    <h3 className={g.faqQuestion}>{item.q}</h3>
                    <p className={g.faqAnswer}>{item.a}</p>
                  </section>
                ))}
              </div>
            </div>
          </section>

          {/* L'appel final des pages publiques (FinalCta), avec le texte et les
              deux liens propres aux guides. */}
          <section className={`${s.container} ${s.finalWrap}`} aria-labelledby="guide-final-title">
            <div className={s.final}>
              <div className={s.finalMascot} aria-hidden="true">
                <Mascot mood="celebrating" size={104} />
              </div>
              <h2 id="guide-final-title" className={`${s.finalTitle} ${s.display}`}>{ui.finalTitle}</h2>
              <p className={s.finalText}>{ui.finalText}</p>
              <div className={`${s.actions} ${s.finalActions}`}>
                <Link href="/dashboard" className={`btn btn-hero ${s.cta}`}>{ui.startTimer}</Link>
                <Link href="/signup" className={`btn ${s.cta} ${s.ctaOnInk}`}>{ui.signup}</Link>
              </div>
            </div>
          </section>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
