import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

// ── Inline icons (SVG, stroke 1.8, matches the app's line-icon language) ──
function IconTimer() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9.5 3h5M12 3v2" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" /><path d="M3.5 20v-1.5a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5V20" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6M18.5 20v-1.5a4.5 4.5 0 0 0-2.3-3.9" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const features = [
  { icon: <IconTimer />, title: "Chrono d'étude", text: "Lance une session libre ou un rythme Pomodoro, garde le cap et enregistre ton temps quand tu crées un compte." },
  { icon: <IconCalendar />, title: "Planning de révision", text: "Organise tes cours, objectifs et examens pour voir clairement ce qui doit avancer chaque jour." },
  { icon: <IconChart />, title: "Stats et progression", text: "Suis tes heures, tes séries, tes records, tes badges et ton XP sans te perdre dans des tableaux compliqués." },
  { icon: <IconUsers />, title: "Motivation sociale", text: "Travaille avec tes amis, groupes et communautés étudiantes quand tu veux rendre le blocus moins solitaire." },
];

const guides = [
  { href: "/pomodoro", title: "Méthode Pomodoro", text: "Découpe tes révisions en blocs de concentration plus faciles à tenir." },
  { href: "/planning-revision", title: "Planning de révision", text: "Construis une semaine réaliste autour de tes examens et priorités." },
  { href: "/stats-etude", title: "Statistiques d'étude", text: "Comprends ton rythme réel, tes séries et ta progression." },
  { href: "/objectifs-etude", title: "Objectifs d'étude", text: "Transforme tes intentions en actions concrètes et mesurables." },
  { href: "/application-etudiant", title: "Application pour étudier", text: "Vois comment choisir un outil utile sans ajouter de friction." },
  { href: "/blocus-belgique", title: "Blocus Belgique", text: "Prépare une période de blocus avec planning, chrono et pauses." },
];

const faq = [
  { q: "Blocus Tracker est-il gratuit ?", a: "Oui. Tu peux tester le chrono gratuitement en mode découverte. Un compte permet surtout de sauvegarder tes données et ta progression." },
  { q: "Faut-il un compte pour utiliser le chrono ?", a: "Non pour essayer le chrono. Oui pour conserver tes statistiques, ton planning, tes amis, tes badges et ton profil." },
  { q: "À qui s'adresse Blocus Tracker ?", a: "Aux étudiants qui veulent structurer leurs révisions, mesurer leur temps d'étude et rester réguliers pendant les périodes de blocus ou d'examens." },
];

// ── Signature: a real, calm product moment — the chrono running on the
//    brand "ink" surface, with the app's own Blocus Blocks. Shows the
//    product instead of describing it. One subtle animation (the active
//    block), reduced-motion-safe via the shared bt-* classes. ──
function ChronoHero() {
  const blocks = [
    { state: "done" }, { state: "done" }, { state: "done" }, { state: "done" },
    { state: "active" }, { state: "todo" }, { state: "todo" }, { state: "todo" },
  ];
  return (
    <div className="card-ink bt-grain relative w-full overflow-hidden rounded-[26px] p-6 sm:p-7"
      role="img" aria-label="Aperçu du chrono Blocus Tracker : session en cours à 1 h 47, cinq blocs d'étude sur huit complétés.">
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
            <span className="relative flex h-2 w-2">
              <span className="bt-pulse-green absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: "#14B885" }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#14B885" }} />
            </span>
            Session en cours
          </span>
          <span className="text-[11px] font-medium" style={{ color: "var(--bt-ink-muted)" }}>Objectif 2 h</span>
        </div>

        <p className="mt-6 font-num text-[3.4rem] font-bold leading-none sm:text-6xl"
          style={{ color: "var(--bt-ink-text)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          1:47:12
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--bt-ink-muted)" }}>Droit constitutionnel — chapitre 4</p>

        <div className="mt-7 flex items-end gap-1.5" aria-hidden="true">
          {blocks.map((b, i) => (
            <span
              key={i}
              className={b.state === "active" ? "bt-block-active" : ""}
              style={{
                width: 10,
                height: b.state === "todo" ? 18 : 40,
                borderRadius: 5,
                backgroundColor: b.state === "todo" ? "rgba(255,255,255,0.14)" : "#14B885",
                opacity: b.state === "done" ? 0.92 : 1,
              }}
            />
          ))}
          <span className="ml-auto font-num text-xs font-semibold" style={{ color: "var(--bt-ink-text)", fontVariantNumeric: "tabular-nums" }}>
            5<span style={{ color: "var(--bt-ink-muted)" }}> / 8 blocs</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--bt-bg)", color: "var(--bt-text-1)" }}>
      {/* ── Header — sticky, blurred, clears the status bar via safe-area ── */}
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "var(--bt-mobile-nav-bg)",
          backdropFilter: "saturate(150%) blur(14px)",
          WebkitBackdropFilter: "saturate(150%) blur(14px)",
          borderBottom: "1px solid var(--bt-border)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5" style={{ minHeight: 58 }}>
          <Link href="/" className="font-display text-xl font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
          <nav className="flex items-center gap-2" aria-label="Navigation principale">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full px-4 text-sm font-semibold transition-colors"
              style={{ minHeight: 44, color: "var(--bt-text-1)", backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}
            >
              Se connecter
            </Link>
            <Link
              href="/signup"
              className="hidden items-center rounded-full px-4 text-sm font-semibold text-white sm:inline-flex"
              style={{ minHeight: 44, backgroundImage: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 6px 18px rgba(20,184,133,0.28)" }}
            >
              Créer un compte
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div style={{ position: "absolute", top: -140, right: -90, width: 440, height: 440, background: "radial-gradient(circle, rgba(20,184,133,0.15), transparent 68%)" }} />
          </div>

          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 lg:flex lg:min-h-[calc(100dvh-58px)] lg:items-center lg:pb-10 lg:pt-4">
            <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-14">
              {/* Thesis */}
              <div>
                <p className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                  style={{ color: "var(--bt-accent-dark)", backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
                  Application d'étude pour étudiants
                </p>
                <h1 className="mt-5 text-[2.6rem] leading-[1.04] sm:text-6xl" style={{ color: "var(--bt-text-1)" }}>
                  Le chrono qui rend ton blocus{" "}
                  <span style={{ color: "#0E8F68" }}>plus clair.</span>
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--bt-text-2)" }}>
                  Chronomètre tes sessions, prépare tes examens et suis ta progression — seul ou avec tes amis. Le chrono est testable tout de suite ; tes données se sauvegardent quand tu crées ton compte.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link href="/dashboard" className="btn-primary justify-center px-6 py-3.5 text-sm">
                    Essayer le chrono
                  </Link>
                  <Link href="/signup" className="btn-ghost justify-center px-6 py-3.5 text-sm" style={{ backgroundColor: "var(--bt-surface)" }}>
                    Créer mon espace
                  </Link>
                </div>

                <p className="mt-4 inline-flex items-center gap-2 text-sm" style={{ color: "var(--bt-text-2)" }}>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                    <IconCheck />
                  </span>
                  Gratuit, sans carte — teste le chrono sans même créer de compte.
                </p>
              </div>

              {/* Signature */}
              <div className="lg:pl-4">
                <ChronoHero />
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────── */}
        <section className="px-5 py-16" style={{ backgroundColor: "var(--bt-bg)", borderTop: "1px solid var(--bt-border)" }}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>
                Pensé pour les vraies semaines de révision.
              </h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Blocus Tracker garde l'interface calme et lisible pour que tu puisses lancer, planifier, mesurer et reprendre sans friction.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {features.map((feature) => (
                <article key={feature.title} className="card card-lift p-5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                    {feature.icon}
                  </span>
                  <h3 className="mt-3.5 text-base" style={{ color: "var(--bt-text-1)" }}>{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Guides ────────────────────────────────────────────────── */}
        <section className="px-5 py-16" style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)" }}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>Guides pour mieux réviser</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Des pages courtes et actionnables pour choisir une méthode, organiser ton blocus et suivre tes progrès.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide) => (
                <Link key={guide.href} href={guide.href} className="card card-lift group flex items-start justify-between gap-3 p-5">
                  <span>
                    <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{guide.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{guide.text}</p>
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="mt-1 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--bt-text-3)" }} aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────── */}
        <section className="px-5 py-16" style={{ backgroundColor: "var(--bt-bg)", borderTop: "1px solid var(--bt-border)" }}>
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>Questions fréquentes</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Les réponses courtes que les étudiants cherchent avant de créer un compte.
              </p>
            </div>
            <div className="space-y-3">
              {faq.map((item) => (
                <article key={item.q} className="rounded-2xl p-5" style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                  <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{item.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{item.a}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing CTA ───────────────────────────────────────────── */}
        <section className="px-5 py-16" style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)" }}>
          <div className="mx-auto max-w-6xl">
            <div className="card-ink bt-grain relative overflow-hidden rounded-[28px] px-6 py-12 text-center sm:px-10 sm:py-14">
              <div className="relative z-10 mx-auto max-w-xl">
                <h2 className="text-2xl sm:text-3xl" style={{ color: "var(--bt-ink-text)" }}>
                  Lance ta première session maintenant.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed" style={{ color: "var(--bt-ink-muted)" }}>
                  Aucune inscription pour essayer. Crée ton espace quand tu veux garder tes stats et ta progression.
                </p>
                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link href="/dashboard" className="inline-flex items-center justify-center rounded-[14px] px-6 py-3.5 text-sm font-semibold"
                    style={{ backgroundColor: "#fff", color: "#0E8F68", minHeight: 44 }}>
                    Essayer le chrono
                  </Link>
                  <Link href="/signup" className="inline-flex items-center justify-center rounded-[14px] px-6 py-3.5 text-sm font-semibold"
                    style={{ minHeight: 44, color: "var(--bt-ink-text)", border: "1px solid var(--bt-ink-border)", backgroundColor: "rgba(255,255,255,0.06)" }}>
                    Créer mon espace
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <footer className="px-5 py-10" style={{ backgroundColor: "var(--bt-bg)", borderTop: "1px solid var(--bt-border)", paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
            <Link href="/" className="font-display text-lg font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
              blocus<span style={{ color: "#14B885" }}>·</span>tracker
            </Link>
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm" style={{ color: "var(--bt-text-2)" }} aria-label="Liens de pied de page">
              <Link href="/login">Se connecter</Link>
              <Link href="/signup">Créer un compte</Link>
              <Link href="/legal">Confidentialité</Link>
            </nav>
            <span className="text-xs" style={{ color: "var(--bt-text-3)" }}>Créé par Mathias Dock</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
