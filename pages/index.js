import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Glyph from "../components/Glyph";
import PublicHeader from "../components/landing/PublicHeader";
import PublicFooter from "../components/landing/PublicFooter";
import HeroDevice from "../components/landing/HeroDevice";
import ProgressObjects from "../components/landing/ProgressObjects";
import RhythmSection from "../components/landing/RhythmSection";
import FinalCta from "../components/landing/FinalCta";
import Shot from "../components/landing/Shot";
import s from "../components/landing/Landing.module.css";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { isManagedOnboardingUser } from "../lib/onboarding.mjs";
import { getLandingContent } from "../lib/landingContent";
import { HOME_FAQ, HOME_FAQ_EN } from "../lib/seo";

// Accueil public. Six moments, pas plus : le hero (le vrai Chrono), ce qui
// entoure le chrono, la régularité, les autres, trois questions, l'appel
// final. Le détail vit sur /fonctionnalites, /guides et /faq.
// Les captures montrent un étudiant de démo (jamais un compte admin), en
// thème clair ; aucun chiffre d'utilisateurs n'est avancé.

function Arrow({ size = 16 }) {
  return <Glyph size={size}><path d="M5 12h14M13 6l6 6-6 6" /></Glyph>;
}

export default function Home() {
  const { user, loading, profileStatus } = useAuth();
  const { lang } = useI18n();
  const router = useRouter();
  const c = getLandingContent(lang);
  const faq = lang === "en" ? HOME_FAQ_EN : HOME_FAQ;

  // Un compte connecté n'a rien à faire sur la vitrine : direction son espace.
  useEffect(() => {
    if (loading || !user) return;
    if (profileStatus === "missing") {
      router.replace({ pathname: "/onboarding", query: { repair: "1" } });
    } else if (profileStatus === "ready") {
      router.replace(isManagedOnboardingUser(user) ? "/onboarding" : "/dashboard");
    }
  }, [loading, profileStatus, router, user]);

  return (
    <div className={`${s.page} font-sans`}>
      <PublicHeader />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.container}>
            <div className={s.heroCopy}>
              <p className={s.eyebrow}>{c.hero.eyebrow}</p>
              <h1 id="hero-title" className={s.heroTitle}>
                <span className={s.titleLine}>{c.hero.titleStart}</span>
                <span className={`${s.titleLine} ${s.titlePayoff}`}>
                  {c.hero.titleEnd}{" "}
                  <span className={s.mark}>
                    {c.hero.titleMark}
                    {/* Quatre blocs d'étude : une heure, qui se remplit une fois. */}
                    <span className={s.markBlocks} aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={s.markBlock}>
                          <span className={s.markFill} style={{ "--i": i }} />
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </h1>
              <p className={s.heroLead}>{c.hero.lead}</p>
              <div className={`${s.actions} ${s.heroActions}`}>
                <Link href="/signup" className={`btn-primary btn-raised btn-raised-action ${s.cta} ${s.ctaPrimary}`}>
                  {c.hero.primary}
                </Link>
                <Link href="/dashboard" className={`btn-ghost ${s.cta} ${s.ctaGhost}`}>
                  {c.hero.secondary}
                </Link>
              </div>
            </div>
            <HeroDevice lang={lang} alt={c.hero.shotAlt} />
          </div>
        </section>

        {/* ── Un chrono, oui. Et tout ce qui va autour. ────────────────── */}
        <section className={s.section} aria-labelledby="tour-title">
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2 id="tour-title" className={`${s.h2} ${s.display}`}>
                {c.tour.title}
                <span className={s.h2Soft}>{c.tour.titleAfter}</span>
              </h2>
              <p className={s.sectionLead}>{c.tour.lead}</p>
            </div>

            <div className={s.bento}>
              <article className={`${s.tile} ${s.tilePlan}`}>
                <div className={s.tileBody}>
                  <h3 className={s.tileTitle}>{c.tour.plan.title}</h3>
                  <p className={s.tileText}>{c.tour.plan.text}</p>
                </div>
                <div className={s.tileMedia}>
                  <Shot lang={lang} name="planning-card" alt={c.tour.plan.alt}
                    sizes="(min-width: 1024px) 380px, (min-width: 640px) 380px, 86vw" className={s.planCard} />
                </div>
              </article>

              <article className={`${s.tile} ${s.tileFocus}`}>
                <div className={s.tileBody}>
                  <h3 className={s.tileTitle}>{c.tour.focus.title}</h3>
                  <p className={s.tileText}>{c.tour.focus.text}</p>
                </div>
                <div className={s.tileMedia}>
                  <Shot lang={lang} name="focus-tile" alt={c.tour.focus.alt}
                    sizes="(min-width: 1024px) 420px, 86vw" className={s.focusShot} />
                </div>
              </article>

              <article className={`${s.tile} ${s.tileProgress}`}>
                <div className={s.tileBody}>
                  <h3 className={s.tileTitle}>{c.tour.progress.title}</h3>
                  <p className={s.tileText}>{c.tour.progress.text}</p>
                </div>
                <ProgressObjects c={c.tour.progress} />
              </article>
            </div>

            <p className="mt-8">
              <Link href="/fonctionnalites" className={s.textLink}>
                {c.tour.more} <Arrow />
              </Link>
            </p>
          </div>
        </section>

        {/* ── Garde le rythme. ─────────────────────────────────────────── */}
        <RhythmSection c={c.rhythm} />

        {/* ── Tu n'étudies pas seul. ───────────────────────────────────── */}
        <section className={s.section} aria-labelledby="social-title">
          <div className={`${s.container} ${s.social}`}>
            <div className={s.socialHead}>
              <h2 id="social-title" className={`${s.h2} ${s.display}`}>{c.social.title}</h2>
              <p className={s.sectionLead}>{c.social.text}</p>
            </div>
            <div className={`${s.phone} ${s.socialPhone}`}>
              <Shot lang={lang} name="spaces-mobile" alt={c.social.alt} sizes="300px" className={s.phoneScreen} />
            </div>
            <ul className={s.socialList}>
              {c.social.items.map((item) => (
                <li key={item.title} className={s.listItem}>
                  <h3 className={s.listTitle}>{item.title}</h3>
                  <p className={s.listText}>{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Avant de commencer ───────────────────────────────────────── */}
        <section className={s.section} aria-labelledby="faq-title">
          <div className={`${s.container} ${s.faq}`}>
            <div>
              <h2 id="faq-title" className={`${s.h2} ${s.display}`}>{c.faq.title}</h2>
              <p className="mt-4">
                <Link href="/faq" className={s.textLink}>
                  {c.faq.more} <Arrow />
                </Link>
              </p>
            </div>
            <div>
              {faq.map((item) => (
                <details key={item.q} className={s.qa}>
                  <summary>
                    {item.q}
                    <span className={s.qaChevron}>
                      <Glyph size={18}><polyline points="6 9 12 15 18 9" /></Glyph>
                    </span>
                  </summary>
                  <p className={s.qaAnswer}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Prêt à t'y mettre ? ─────────────────────────────────────── */}
        <FinalCta />
      </main>

      <PublicFooter />
    </div>
  );
}
