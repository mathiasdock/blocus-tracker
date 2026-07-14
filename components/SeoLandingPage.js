import Image from "next/image";
import Link from "next/link";
import { useI18n } from "../contexts/I18nContext";
import { SEO_LANDING_PAGES_EN } from "../lib/seoLandingPagesEn";

const guideLinks = [
  { href: "/pomodoro", label: "Pomodoro" },
  { href: "/planning-revision", label: "Planning" },
  { href: "/stats-etude", label: "Stats" },
  { href: "/blocus-belgique", label: "Blocus" },
];

// Chaînes fixes de la coquille (pas propres à une page). Le contenu par page
// vit dans lib/seoLandingPages(.En).js. Meta/JSON-LD restent FR via SeoHead.
const UI = {
  fr: {
    login: "Se connecter", signup: "Créer un compte", guidesAria: "Guides publics", accountAria: "Compte",
    included: "Inclus",
    previewAlt: "Aperçu de Blocus Tracker avec chrono, planning et statistiques d'étude",
    shortAnswer: "Réponse courte",
    createSpace: "Créer mon espace",
    relatedTitle: "Continuer intelligemment",
    relatedText: "Ces guides sont liés entre eux pour construire un vrai système de révision : méthode, planning, objectifs, suivi et motivation.",
    faqTitle: "Questions fréquentes",
    faqText: "Des réponses directes pour t'aider à choisir une méthode et un outil sans perdre une soirée à comparer.",
    finalTitle: "Passe de l'intention à une vraie session.",
    finalText: "Tu peux tester le chrono tout de suite. Crée un compte quand tu veux sauvegarder ton planning, tes statistiques et ta progression.",
    startTimer: "Lancer le chrono",
  },
  en: {
    login: "Sign in", signup: "Create an account", guidesAria: "Public guides", accountAria: "Account",
    included: "Included",
    previewAlt: "Preview of Blocus Tracker with timer, planner and study stats",
    shortAnswer: "Short answer",
    createSpace: "Create my space",
    relatedTitle: "Keep going, smartly",
    relatedText: "These guides connect to build a real revision system: method, planning, goals, tracking and motivation.",
    faqTitle: "Frequently asked questions",
    faqText: "Direct answers to help you choose a method and a tool without losing an evening comparing.",
    finalTitle: "Go from intention to a real session.",
    finalText: "You can try the timer right now. Create an account when you want to save your plan, your stats and your progress.",
    startTimer: "Start the timer",
  },
};

function PublicHeader({ ui }) {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Link href="/" className="font-display text-xl font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
        blocus<span style={{ color: "#14B885" }}>·</span>tracker
      </Link>
      <nav className="hidden items-center gap-4 text-sm font-semibold md:flex" aria-label={ui.guidesAria}>
        {guideLinks.map((link) => (
          <Link key={link.href} href={link.href} className="transition-colors" style={{ color: "var(--bt-text-2)" }}>
            {link.label}
          </Link>
        ))}
      </nav>
      <nav className="flex items-center gap-2" aria-label={ui.accountAria}>
        <Link
          href="/login"
          className="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
          style={{
            color: "var(--bt-accent-dark)",
            backgroundColor: "var(--bt-accent-bg)",
            border: "1px solid var(--bt-accent-border)",
          }}
        >
          {ui.login}
        </Link>
        <Link
          href="/signup"
          className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white sm:inline-flex"
          style={{ backgroundColor: "#14B885", boxShadow: "0 8px 22px rgba(20,184,133,0.22)" }}
        >
          {ui.signup}
        </Link>
      </nav>
    </header>
  );
}

function BulletList({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-5 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--bt-accent)" }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SeoLandingPage({ page }) {
  const { lang } = useI18n();
  // Contenu visible : anglais si l'appareil est anglophone. Le SSG rend le
  // français (indexé pour les mots-clés FR) ; l'anglais s'affiche après
  // hydratation. Les meta/JSON-LD (SeoHead) restent toujours FR.
  const ui = UI[lang === "en" ? "en" : "fr"];
  const en = lang === "en" ? SEO_LANDING_PAGES_EN[page.path] : null;
  const p = en ? { ...page, ...en } : page;

  return (
    <div className="min-h-screen overflow-hidden" style={{ backgroundColor: "var(--bt-bg)" }}>
      <PublicHeader ui={ui} />

      <main>
        <article>
          <section className="relative px-5 pb-12 pt-8 sm:pt-14">
            <div className="absolute inset-0 -z-10 auth-bg opacity-20" aria-hidden="true" />
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.78fr]">
              <div>
                <p
                  className="mb-4 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase"
                  style={{
                    color: "var(--bt-accent-dark)",
                    backgroundColor: "var(--bt-accent-bg)",
                    border: "1px solid var(--bt-accent-border)",
                  }}
                >
                  {p.eyebrow}
                </p>
                <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl" style={{ color: "var(--bt-text-1)" }}>
                  {p.h1}
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--bt-text-2)" }}>
                  {p.lead}
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link href="/dashboard" className="btn-primary px-6 py-3 text-center text-sm">
                    {p.ctaLabel}
                  </Link>
                  <Link
                    href={p.secondaryCtaHref}
                    className="btn-ghost px-6 py-3 text-center text-sm"
                    style={{ backgroundColor: "var(--bt-surface)" }}
                  >
                    {p.secondaryCtaLabel}
                  </Link>
                </div>
                <dl className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
                  {p.proofPoints.map((point) => (
                    <div key={point} className="rounded-2xl p-4" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                      <dt className="text-xs font-bold uppercase" style={{ color: "var(--bt-accent-dark)" }}>{ui.included}</dt>
                      <dd className="mt-1 text-sm font-semibold leading-snug" style={{ color: "var(--bt-text-1)" }}>{point}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <figure className="relative">
                <div className="overflow-hidden rounded-[28px]" style={{ border: "1px solid var(--bt-border)", boxShadow: "0 20px 50px var(--bt-shadow)" }}>
                  <Image
                    src="/seo-preview.png"
                    alt={ui.previewAlt}
                    width={1200}
                    height={630}
                    priority
                    sizes="(min-width: 1024px) 420px, 100vw"
                    className="h-auto w-full"
                  />
                </div>
              </figure>
            </div>
          </section>

          <section className="px-5 py-10">
            <div className="mx-auto max-w-3xl rounded-3xl p-6 sm:p-7" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
              <h2 className="text-xl sm:text-2xl" style={{ color: "var(--bt-text-1)" }}>{ui.shortAnswer}</h2>
              <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{p.shortAnswer}</p>
            </div>
          </section>

          <section className="px-5 py-8">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.68fr_0.32fr]">
              <div className="space-y-12">
                {p.sections.map((section) => (
                  <section key={section.title}>
                    <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>{section.title}</h2>
                    <div className="mt-4 space-y-4">
                      {section.body.map((paragraph) => (
                        <p key={paragraph} className="text-base leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    <BulletList items={section.bullets} />
                  </section>
                ))}
              </div>

              <aside className="lg:sticky lg:top-6 lg:self-start">
                <div className="card-ink bt-grain p-6">
                  <div className="relative z-10">
                    <h2 className="text-xl">{p.featurePanel.title}</h2>
                    <ul className="mt-5 space-y-3">
                      {p.featurePanel.items.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-relaxed" style={{ color: "var(--bt-ink-muted)" }}>
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/signup" className="mt-6 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold" style={{ color: "#0E8F68" }}>
                      {ui.createSpace}
                    </Link>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="px-5 py-12" style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)", borderBottom: "1px solid var(--bt-border)" }}>
            <div className="mx-auto max-w-6xl">
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>{ui.relatedTitle}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                {ui.relatedText}
              </p>
              <div className="mt-7 grid gap-4 md:grid-cols-3">
                {p.related.map((item) => (
                  <Link key={item.href} href={item.href} className="card card-lift block p-5">
                    <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{item.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{item.text}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="px-5 py-14">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>{ui.faqTitle}</h2>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                  {ui.faqText}
                </p>
              </div>
              <div className="space-y-3">
                {p.faq.map((item) => (
                  <section key={item.q} className="rounded-2xl p-5" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                    <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{item.q}</h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{item.a}</p>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section className="px-5 pb-16">
            <div className="mx-auto max-w-4xl rounded-[28px] p-7 text-center sm:p-10" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>{ui.finalTitle}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                {ui.finalText}
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className="btn-primary px-6 py-3 text-center text-sm">
                  {ui.startTimer}
                </Link>
                <Link href="/signup" className="btn-ghost px-6 py-3 text-center text-sm">
                  {ui.signup}
                </Link>
              </div>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
