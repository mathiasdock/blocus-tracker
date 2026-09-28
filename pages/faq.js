import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import FinalCta from "../components/landing/FinalCta";
import s from "../components/landing/Landing.module.css";
import { useI18n } from "../contexts/I18nContext";
import { getLandingContent } from "../lib/landingContent";
import { FAQ, FAQ_EN } from "../lib/seo";

// Toutes les questions, réponses visibles d'emblée (pas d'accordéon : c'est
// une page de lecture). Le JSON-LD FAQPage lit la même liste (lib/seo.js).
export default function FaqPage() {
  const { lang } = useI18n();
  const p = getLandingContent(lang).faqPage;
  const faq = lang === "en" ? FAQ_EN : FAQ;

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />
      <main>
        <section className={s.pageHero}>
          <div className={s.container}>
            <p className={s.eyebrow}>{p.eyebrow}</p>
            <h1 className={s.pageTitle}>{p.title}</h1>
            <p className={s.pageLead}>{p.lead}</p>
          </div>
        </section>

        <section className={s.section} style={{ paddingTop: 40 }}>
          <div className={s.container}>
            {faq.map((item) => (
              <article key={item.q} className={s.faqItem}>
                <h2 className={s.faqQuestion}>{item.q}</h2>
                <p className={s.faqAnswer}>{item.a}</p>
              </article>
            ))}
          </div>
        </section>

        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  );
}
