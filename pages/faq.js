import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import FinalCta from "../components/landing/FinalCta";
import s from "../components/landing/Landing.module.css";
import g from "../components/landing/Guide.module.css";
import sh from "../components/landing/Showcase.module.css";
import { useI18n } from "../contexts/I18nContext";
import { getLandingContent } from "../lib/landingContent";
import { FAQ, FAQ_EN } from "../lib/seo";

// Toutes les questions, réponses visibles d'emblée (pas d'accordéon : c'est
// une page de lecture). Le JSON-LD FAQPage lit la même liste (lib/seo.js).
// Sur grand écran, un sommaire numéroté, collé à gauche sous l'en-tête, mène
// à chaque réponse ; sur une colonne, les questions numérotées se suivent.
export default function FaqPage() {
  const { lang } = useI18n();
  const p = getLandingContent(lang).faqPage;
  const faq = lang === "en" ? FAQ_EN : FAQ;

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={sh.hero}>
          <div className={s.container}>
            <p className={s.eyebrow}>{p.eyebrow}</p>
            <h1 className={g.title}>{p.title}</h1>
            <p className={`${g.lead} ${sh.heroLead}`}>{p.lead}</p>
          </div>
        </section>

        <div className={`${s.container} ${sh.faqLayout}`}>
          <nav className={sh.faqNav} aria-label={p.title}>
            <ol role="list" className={sh.faqNavList}>
              {faq.map((item, index) => (
                <li key={item.q} className={sh.faqNavItem}>
                  <a href={`#question-${index + 1}`} className={sh.faqNavLink}>{item.q}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={sh.faqList}>
            {faq.map((item, index) => (
              <article key={item.q} id={`question-${index + 1}`} className={sh.faqItem}>
                <h2 className={`${sh.faqQuestion} ${s.display}`}>{item.q}</h2>
                <p className={sh.faqAnswer}>{item.a}</p>
              </article>
            ))}
          </div>
        </div>

        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
