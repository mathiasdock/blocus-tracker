import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Glyph from "../components/Glyph";
import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import s from "../components/landing/Landing.module.css";
import g from "../components/landing/Guide.module.css";
import sh from "../components/landing/Showcase.module.css";
import l from "../components/landing/Legal.module.css";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { LEGAL_DOCS, LEGAL_EFFECTIVE_DATE } from "../lib/legal";

const TAB_KEYS = {
  privacy: "legal.tabPrivacy",
  terms:   "legal.tabTerms",
  cookies: "legal.tabCookies",
  notice:  "legal.tabNotice",
};
const DEFAULT_DOC = "privacy";

// Les quatre documents juridiques, sur la mise en page du site public (en-tête,
// pied de page, typographie de la FAQ et des guides) plutôt que dans la coquille
// de l'app. Un document à la fois, comme avant : /legal?doc=cookies ouvre
// directement le bon (bandeau cookies, inscription, profil, rappel des CGU), et
// en changer remplace l'adresse sans empiler l'historique. Les quatre restent
// dans le HTML — les documents fermés sont seulement masqués — pour être lus
// sans JavaScript par les moteurs ; avant, seul le premier y figurait.
// Le titre, la description et le fil d'Ariane viennent de lib/seo.js (SeoHead).
export default function Legal() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  // Avant l'hydratation, l'adresse n'est pas lue : le rendu serveur et le
  // premier rendu du navigateur montrent la confidentialité, puis le document
  // demandé (une navigation dans l'app l'ouvre d'emblée).
  const requested = router.isReady ? router.query.doc : undefined;
  const active = typeof requested === "string" && LEGAL_DOCS.some((d) => d.id === requested)
    ? requested
    : DEFAULT_DOC;
  const locale = lang === "en" ? "en" : "fr";
  const updated = LEGAL_EFFECTIVE_DATE[locale];
  const activeDoc = LEGAL_DOCS.find((d) => d.id === active);
  const activeContent = activeDoc[locale] || activeDoc.fr;

  // Changer de document depuis la liste collée (ordinateur) en bas d'un long
  // texte : le nouveau document s'affiche depuis son début, pas au milieu.
  const docsRef = useRef(null);
  const shownRef = useRef(active);
  useEffect(() => {
    if (shownRef.current === active) return;
    shownRef.current = active;
    const docs = docsRef.current;
    if (docs && docs.getBoundingClientRect().top < 80) docs.scrollIntoView({ block: "start" });
  }, [active]);

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={sh.hero}>
          <div className={s.container}>
            {/* Un compte connecté arrive ici depuis l'app (profil, bandeau,
                rappel des CGU) : le chemin du retour prend la ligne du
                surtitre, sans rien déplacer. */}
            <p className={s.eyebrow}>
              {user ? (
                <Link href="/dashboard" className={l.back}>
                  <Glyph size={14}><path d="m15 18-6-6 6-6" /></Glyph>
                  {t("legal.backToApp")}
                </Link>
              ) : t("legal.eyebrow")}
            </p>
            <h1 className={g.title}>{t("legal.pageTitle")}</h1>
            <p className={`${g.lead} ${sh.heroLead}`}>{t("legal.pageSubtitle")}</p>
          </div>
        </section>

        <div className={`${s.container} ${l.layout}`}>
          {/* Les quatre documents d'abord, toujours visibles ; sur ordinateur,
              les sections du document ouvert suivent (14 pour la
              confidentialité : glissées entre les documents, elles
              cachaient les trois autres sous le bas de l'écran). */}
          <div className={l.nav}>
            <nav aria-label={t("legal.pageTitle")}>
              <ul role="list" className={l.docList}>
                {LEGAL_DOCS.map((d) => (
                  <li key={d.id} className={l.docItem}>
                    <Link href={{ pathname: "/legal", query: { doc: d.id } }} replace shallow scroll={false}
                      className={l.docLink} aria-current={d.id === active ? "page" : undefined}>
                      {t(TAB_KEYS[d.id])}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav className={l.toc} aria-labelledby="legal-toc-title">
              <p id="legal-toc-title" className={l.tocTitle}>{t("legal.inThisDocument")}</p>
              <ul role="list" className={l.sectionList}>
                {activeContent.sections.map((section, i) => (
                  <li key={section.h}>
                    <a href={`#legal-${active}-${i + 1}`} className={l.sectionLink}>{section.h}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div ref={docsRef} className={l.docs}>
            {LEGAL_DOCS.map((d) => {
              const content = d[locale] || d.fr;
              return (
                <article key={d.id} id={`legal-${d.id}`} className={l.doc} hidden={d.id !== active}
                  aria-labelledby={`legal-${d.id}-title`}>
                  <h2 id={`legal-${d.id}-title`} className={`${g.h2} ${s.display}`}>{content.title}</h2>
                  <p className={l.byline}>{t("legal.updated")}{locale === "fr" ? " : " : ": "}{updated}</p>
                  {content.sections.map((section, i) => (
                    <section key={section.h} id={`legal-${d.id}-${i + 1}`} className={l.section}>
                      <h3 className={l.sectionTitle}>{section.h}</h3>
                      {section.body.map((item, j) =>
                        typeof item === "string" ? (
                          <p key={j} className={l.paragraph}>{item}</p>
                        ) : (
                          <ul key={j} role="list" className={l.list}>
                            {item.list.map((li, k) => <li key={k} className={l.listItem}>{li}</li>)}
                          </ul>
                        )
                      )}
                    </section>
                  ))}
                </article>
              );
            })}
            <p className={l.credit}>
              {t("legal.audioCredit")}{" "}
              <a href="https://elevenlabs.io/sound-effects" target="_blank" rel="noreferrer">ElevenLabs</a>
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
