import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { COUNTRIES } from "../lib/universities";

// ─────────────────────────────────────────────────────────────────────────────
// Landing publique — refonte "app-first" : de vrais screenshots du produit
// (public/site-web/opt/*.webp), la marque verte/crème de l'app, et une couche
// de motion sobre (révélation au scroll, un marquee, un flottement ambiant).
// Aucun chiffre inventé : 200+ étudiants sont réels ; le nombre de communautés
// et de pays est calculé depuis lib/universities.js pour ne jamais devenir faux.
// ─────────────────────────────────────────────────────────────────────────────

const SHOT = (name) => `/site-web/opt/${name}.webp`;

const UNIVERSITY_COUNT = COUNTRIES.reduce((n, c) => n + c.universities.length, 0);
const COUNTRY_COUNT = COUNTRIES.length;

const GUIDES = [
  { href: "/pomodoro", title: "Méthode Pomodoro", text: "Découpe tes révisions en blocs de concentration plus faciles à tenir." },
  { href: "/planning-revision", title: "Planning de révision", text: "Construis une semaine réaliste autour de tes examens et priorités." },
  { href: "/stats-etude", title: "Statistiques d'étude", text: "Comprends ton rythme réel, tes séries et ta progression." },
  { href: "/objectifs-etude", title: "Objectifs d'étude", text: "Transforme tes intentions en actions concrètes et mesurables." },
  { href: "/application-etudiant", title: "Application pour étudier", text: "Vois comment choisir un outil utile sans ajouter de friction." },
  { href: "/blocus-belgique", title: "Blocus Belgique", text: "Prépare une période de blocus avec planning, chrono et pauses." },
];

const FAQ = [
  { q: "Blocus Tracker est-il gratuit ?", a: "Oui. Tu peux tester le chrono gratuitement en mode découverte. Un compte permet surtout de sauvegarder tes données et ta progression." },
  { q: "Faut-il un compte pour utiliser le chrono ?", a: "Non pour essayer le chrono. Oui pour conserver tes statistiques, ton planning, tes amis, tes badges et ton profil." },
  { q: "À qui s'adresse Blocus Tracker ?", a: "Aux étudiants qui veulent structurer leurs révisions, mesurer leur temps d'étude et rester réguliers pendant les périodes de blocus ou d'examens." },
];

const STATS = [
  { value: "200+", label: "étudiants inscrits" },
  { value: `${UNIVERSITY_COUNT}`, label: "communautés d'écoles" },
  { value: `${COUNTRY_COUNT}`, label: "pays représentés" },
  { value: "100%", label: "gratuit, sans carte" },
];

// Logos d'écoles réels, dérivés de la même source que l'app (toujours à jour).
const SCHOOL_LOGOS = COUNTRIES.flatMap((c) => c.universities).filter((u) => u.logo);

function IconCheck({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconArrow({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function IconChevron({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Cadre "navigateur" autour d'un screenshot desktop.
function BrowserFrame({ src, alt, width, height, priority = false, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-[20px] sm:rounded-[24px] ${className}`}
      style={{ border: "1px solid var(--bt-border)", backgroundColor: "var(--bt-surface)", boxShadow: "0 24px 70px var(--bt-shadow)" }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--bt-border)" }}>
        <span className="flex gap-1.5" aria-hidden="true">
          {["#F87171", "#FBBF24", "#34D399"].map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c, opacity: 0.8 }} />
          ))}
        </span>
        <span className="mx-auto rounded-full px-4 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--bt-subtle)", color: "var(--bt-text-3)" }}>
          blocus-tracker.com
        </span>
        <span className="w-8" aria-hidden="true" />
      </div>
      <Image src={src} alt={alt} width={width} height={height} priority={priority}
        sizes="(min-width: 1024px) 900px, 100vw" className="h-auto w-full" />
    </div>
  );
}

// Cadre "téléphone" autour d'un screenshot mobile.
function PhoneFrame({ src, alt, width, height, className = "", style = {} }) {
  return (
    <div className={`shrink-0 rounded-[34px] p-2 ${className}`}
      style={{ backgroundColor: "var(--bt-ink)", boxShadow: "0 22px 55px var(--bt-shadow)", ...style }}>
      <Image src={src} alt={alt} width={width} height={height}
        sizes="240px" className="h-auto w-full rounded-[26px]" />
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  // Révélation au scroll : ajoute .is-in à chaque [data-reveal] qui entre
  // dans le viewport (une seule fois). Sans IO, tout est visible d'office.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  function scrollToId(e, id) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--bt-bg)", color: "var(--bt-text-1)" }}>
      {/* ── Header — sticky, flouté, safe-area ─────────────────────────── */}
      <header className="sticky top-0 z-50"
        style={{
          backgroundColor: "var(--bt-mobile-nav-bg)",
          backdropFilter: "saturate(150%) blur(14px)",
          WebkitBackdropFilter: "saturate(150%) blur(14px)",
          borderBottom: "1px solid var(--bt-border)",
          paddingTop: "env(safe-area-inset-top)",
        }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5" style={{ minHeight: 62 }}>
          <Link href="/" className="font-display text-xl font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
            blocus<span style={{ color: "#14B885" }}>·</span>tracker
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Sections de la page">
            {[["fonctionnalites", "Fonctionnalités"], ["guides", "Guides"], ["faq", "FAQ"]].map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={(e) => scrollToId(e, id)}
                className="rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
                style={{ color: "var(--bt-text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bt-subtle)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                {label}
              </a>
            ))}
          </nav>
          <nav className="flex items-center gap-2" aria-label="Navigation principale">
            <Link href="/login" className="inline-flex items-center rounded-full px-4 text-sm font-semibold transition-colors"
              style={{ minHeight: 44, color: "var(--bt-text-1)", backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
              Se connecter
            </Link>
            <Link href="/signup" className="hidden items-center rounded-full px-4 text-sm font-semibold text-white sm:inline-flex"
              style={{ minHeight: 44, backgroundImage: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 6px 18px rgba(20,184,133,0.28)" }}>
              Créer mon espace
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero — centré, gros type, vrai produit dessous ─────────────── */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div style={{ position: "absolute", top: -220, left: "50%", transform: "translateX(-50%)", width: 900, height: 620, background: "radial-gradient(closest-side, rgba(20,184,133,0.16), transparent 72%)" }} />
          </div>

          <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 text-center sm:pt-20">
            <div className="bt-stagger mx-auto max-w-3xl">
              <p className="mx-auto inline-flex rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wide"
                style={{ color: "var(--bt-accent-dark)", backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
                Application d'étude pour étudiants
              </p>
              <h1 className="mt-6 text-[2.7rem] leading-[1.03] sm:text-6xl lg:text-7xl" style={{ color: "var(--bt-text-1)", letterSpacing: "-0.03em" }}>
                Le chrono qui rend ton blocus <span style={{ color: "#0E8F68" }}>plus clair.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--bt-text-2)" }}>
                Chronomètre tes sessions, planifie tes examens, suis ta progression. Seul ou avec tes amis, gratuitement.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className="btn-primary justify-center px-7 py-3.5 text-sm">
                  Essayer le chrono
                </Link>
                <Link href="/signup" className="btn-ghost justify-center px-7 py-3.5 text-sm" style={{ backgroundColor: "var(--bt-surface)" }}>
                  Créer mon espace
                </Link>
              </div>
            </div>

            {/* Vrai produit : desktop encadré + mobile flottant */}
            <div className="relative mx-auto mt-14 max-w-4xl sm:mt-16" data-reveal>
              <BrowserFrame src={SHOT("chrono-desktop")} alt="Le chrono Blocus Tracker sur ordinateur : session prête à démarrer, objectifs du jour et cours" width={1920} height={1088} priority />
              <div className="bt-float absolute -right-3 bottom-[-9%] w-[136px] sm:-right-8 sm:w-[190px]" style={{ "--float-rot": "2deg" }}>
                <PhoneFrame src={SHOT("chrono-mobile")} alt="Le chrono Blocus Tracker sur téléphone" width={359} height={780} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Chiffres réels — bande fine, pas de cartes ─────────────────── */}
        <section className="px-5 pb-4 pt-14 sm:pt-20">
          <dl className="mx-auto grid max-w-4xl grid-cols-2 gap-y-8 sm:grid-cols-4" data-reveal>
            {STATS.map((s, i) => (
              <div key={s.label} className="px-4 text-center sm:text-left"
                style={i > 0 ? { borderLeft: "1px solid var(--bt-border)" } : {}}>
                <dd className="font-num text-3xl font-bold sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>{s.value}</dd>
                <dt className="mt-1 text-xs sm:text-sm" style={{ color: "var(--bt-text-3)" }}>{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Mode focus — pleine largeur, surface ink ───────────────────── */}
        <section id="fonctionnalites" className="scroll-mt-24 px-5 py-14 sm:py-20">
          <div className="card-ink bt-grain mx-auto max-w-6xl overflow-hidden rounded-[28px] sm:rounded-[36px]" data-reveal>
            <div className="relative z-10 grid items-center gap-10 p-7 sm:p-12 lg:grid-cols-2 lg:gap-14">
              <div>
                <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-ink-text)" }}>
                  Un mode focus qui coupe tout le reste.
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-ink-muted)" }}>
                  Plein écran, une matière, et des blocs de concentration qui se remplissent au fil de la session. Le chrono continue même si tu changes d'onglet.
                </p>
                <ul className="mt-6 space-y-3">
                  {["Blocs de 25 minutes ou session libre", "Pause visible, reprise en un geste", "Ta session s'enregistre dans tes stats"].map((li) => (
                    <li key={li} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--bt-ink-text)" }}>
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(20,184,133,0.22)", color: "#34D399" }}>
                        <IconCheck size={11} />
                      </span>
                      {li}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--bt-ink-border)", boxShadow: "0 24px 60px rgba(4,20,15,0.5)" }}>
                <Image src={SHOT("focus-desktop")} alt="Le mode focus de Blocus Tracker en plein écran" width={1600} height={908}
                  sizes="(min-width: 1024px) 520px, 100vw" className="h-auto w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Planning — split image / texte ─────────────────────────────── */}
        <section className="px-5 py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div data-reveal className="order-2 lg:order-1">
              <BrowserFrame src={SHOT("planning-desktop")} alt="Le planning de révision Blocus Tracker : vue mois, objectifs du jour et examens à venir" width={1400} height={793} />
            </div>
            <div data-reveal className="order-1 lg:order-2" style={{ "--rv-delay": "0.08s" }}>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                Sache exactement quoi réviser aujourd'hui.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                Des objectifs par jour, tes examens avec compte à rebours, et une carte "à préparer cette semaine" qui pense à ta place.
              </p>
              <ul className="mt-6 space-y-3">
                {["Objectifs quotidiens, cochés en un tap", "Examens avec badge J-7, J-3, demain", "Export vers Apple ou Google Calendar"].map((li) => (
                  <li key={li} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--bt-text-1)" }}>
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--bt-accent-bg)", color: "var(--bt-accent-dark)" }}>
                      <IconCheck size={11} />
                    </span>
                    {li}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Stats — split inversé, deux visuels superposés ─────────────── */}
        <section className="px-5 py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div data-reveal>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                Ta progression, noir sur blanc.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                Temps d'étude, séries, records et classement entre amis. De quoi rester motivé sans te raconter d'histoires.
              </p>
              <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                style={{ color: "var(--bt-accent-dark)" }}>
                Voir le chrono en action <IconArrow size={15} />
              </Link>
            </div>
            <div className="relative" data-reveal style={{ "--rv-delay": "0.08s" }}>
              <BrowserFrame src={SHOT("stats-desktop")} alt="Les statistiques d'étude Blocus Tracker : temps, séries et progression" width={1355} height={768} />
              <div className="absolute -bottom-8 -left-3 w-[46%] overflow-hidden rounded-xl sm:-left-8"
                style={{ border: "1px solid var(--bt-border)", boxShadow: "0 18px 44px var(--bt-shadow)", transform: "rotate(-2deg)" }}>
                <Image src={SHOT("classement-desktop")} alt="Le classement entre amis" width={1100} height={623}
                  sizes="(min-width: 1024px) 260px, 45vw" className="h-auto w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Social + communautés — grand conteneur teinté ──────────────── */}
        <section className="px-5 py-14 sm:py-20">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[28px] sm:rounded-[36px]"
            style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }} data-reveal>
            <div className="p-7 sm:p-12">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                  Le blocus, c'est mieux à plusieurs.
                </h2>
                <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                  Messages privés, groupes d'étude et une communauté pour ton école. Compare ta semaine avec tes amis et restez réguliers ensemble.
                </p>
              </div>

              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                {[
                  { shot: "social-desktop", alt: "L'espace Social de Blocus Tracker : amis, messages et groupes", caption: "Amis, messages et groupes d'étude" },
                  { shot: "communautes-desktop", alt: "Les communautés d'écoles de Blocus Tracker", caption: "Salon, questions et examens par école" },
                ].map((c, i) => (
                  <figure key={c.shot} data-reveal style={{ "--rv-delay": `${i * 0.08}s` }}>
                    <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--bt-border)", boxShadow: "0 18px 50px var(--bt-shadow)" }}>
                      <Image src={SHOT(c.shot)} alt={c.alt} width={1400} height={793}
                        sizes="(min-width: 1024px) 520px, 100vw" className="h-auto w-full" />
                    </div>
                    <figcaption className="mt-3 text-center text-xs font-medium" style={{ color: "var(--bt-text-3)" }}>{c.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            {/* Marquee des vraies écoles (même source que l'app) */}
            <div className="pb-8">
              <p className="mb-5 text-center text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-accent-dark)" }}>
                {UNIVERSITY_COUNT} communautés, {COUNTRY_COUNT} pays
              </p>
              <div className="bt-marquee overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}>
                <div className="bt-marquee-track gap-3 pr-3">
                  {[...SCHOOL_LOGOS, ...SCHOOL_LOGOS].map((u, i) => (
                    <span key={`${u.id}-${i}`} className="inline-flex items-center gap-2.5 rounded-full py-2 pl-3 pr-4"
                      style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }} aria-hidden={i >= SCHOOL_LOGOS.length}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.logo} alt="" loading="lazy" className="h-6 w-6 object-contain" />
                      <span className="whitespace-nowrap text-sm font-medium" style={{ color: "var(--bt-text-2)" }}>{u.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Mobile — trois téléphones, vraie PWA ───────────────────────── */}
        <section className="overflow-hidden px-5 py-14 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center" data-reveal>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                Dans ta poche, comme une vraie app.
              </h2>
              <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                Blocus Tracker s'installe sur ton écran d'accueil, sans App Store. Chrono, missions du jour et stats te suivent partout.
              </p>
            </div>
            <div className="mt-12 flex items-start justify-center gap-4 sm:gap-8">
              {[
                { shot: "stats-mobile", alt: "Les statistiques sur mobile", w: 640, h: 1391, cls: "mt-10 hidden sm:block" },
                { shot: "focus-mobile", alt: "Le mode focus sur mobile", w: 359, h: 780, cls: "" },
                { shot: "progression-mobile", alt: "Niveau, missions du jour et badges sur mobile", w: 359, h: 780, cls: "mt-14" },
              ].map((p, i) => (
                <div key={p.shot} className={`w-[200px] sm:w-[230px] ${p.cls}`} data-reveal style={{ "--rv-delay": `${i * 0.09}s` }}>
                  <PhoneFrame src={SHOT(p.shot)} alt={p.alt} width={p.w} height={p.h} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Guides (SEO) ────────────────────────────────────────────────── */}
        <section id="guides" className="scroll-mt-24 px-5 py-14 sm:py-20" style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)", borderBottom: "1px solid var(--bt-border)" }}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl" data-reveal>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>Guides pour mieux réviser</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Des pages courtes et actionnables pour choisir une méthode, organiser ton blocus et suivre tes progrès.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {GUIDES.map((g, i) => (
                // data-reveal sur un wrapper : sa transition ne doit pas écraser
                // celle du hover .card-lift sur la carte elle-même.
                <div key={g.href} data-reveal style={{ "--rv-delay": `${(i % 3) * 0.07}s` }}>
                  <Link href={g.href} className="card card-lift group flex h-full items-start justify-between gap-3 p-5">
                    <span>
                      <h3 className="text-base" style={{ color: "var(--bt-text-1)" }}>{g.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{g.text}</p>
                    </span>
                    <span className="mt-1 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--bt-text-3)" }}>
                      <IconArrow />
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ — accordéon natif ──────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-24 px-5 py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-reveal>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>Questions fréquentes</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                Les réponses courtes que les étudiants cherchent avant de créer un compte.
              </p>
            </div>
            <div className="space-y-3" data-reveal style={{ "--rv-delay": "0.08s" }}>
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-2xl px-5"
                  style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)" }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold [&::-webkit-details-marker]:hidden"
                    style={{ color: "var(--bt-text-1)" }}>
                    {item.q}
                    <span className="shrink-0 transition-transform duration-200 group-open:rotate-180" style={{ color: "var(--bt-text-3)" }}>
                      <IconChevron />
                    </span>
                  </summary>
                  <p className="pb-5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA final — surface ink ────────────────────────────────────── */}
        <section className="px-5 pb-16 sm:pb-20">
          <div className="card-ink bt-grain mx-auto max-w-6xl overflow-hidden rounded-[28px] px-6 py-14 text-center sm:rounded-[36px] sm:px-10 sm:py-20" data-reveal>
            <div className="relative z-10 mx-auto max-w-xl">
              <h2 className="text-3xl sm:text-4xl" style={{ color: "var(--bt-ink-text)" }}>
                Lance ta première session maintenant.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-ink-muted)" }}>
                Aucune inscription pour essayer. Ton espace se crée quand tu veux garder tes stats et ta progression.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className="inline-flex items-center justify-center rounded-[14px] px-7 py-3.5 text-sm font-semibold"
                  style={{ backgroundColor: "#fff", color: "#0E8F68", minHeight: 44 }}>
                  Essayer le chrono
                </Link>
                <Link href="/signup" className="inline-flex items-center justify-center rounded-[14px] px-7 py-3.5 text-sm font-semibold"
                  style={{ minHeight: 44, color: "var(--bt-ink-text)", border: "1px solid var(--bt-ink-border)", backgroundColor: "rgba(255,255,255,0.06)" }}>
                  Créer mon espace
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="px-5 pt-12" style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)", paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Link href="/" className="font-display text-lg font-bold tracking-tight" style={{ color: "var(--bt-text-1)" }}>
                blocus<span style={{ color: "#14B885" }}>·</span>tracker
              </Link>
              <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: "var(--bt-text-3)" }}>
                Reste calme, étudie régulièrement. L'app d'étude gratuite pour les périodes de blocus et d'examens.
              </p>
            </div>
            <nav aria-label="Produit">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>Produit</p>
              <ul className="mt-3 space-y-2 text-sm">
                {[["/dashboard", "Essayer le chrono"], ["/signup", "Créer mon espace"], ["/login", "Se connecter"]].map(([href, label]) => (
                  <li key={href}><Link href={href} className="transition-colors hover:underline" style={{ color: "var(--bt-text-2)" }}>{label}</Link></li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Ressources">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>Ressources</p>
              <ul className="mt-3 space-y-2 text-sm">
                {[["/pomodoro", "Méthode Pomodoro"], ["/blocus-belgique", "Blocus Belgique"], ["/legal", "Confidentialité"]].map(([href, label]) => (
                  <li key={href}><Link href={href} className="transition-colors hover:underline" style={{ color: "var(--bt-text-2)" }}>{label}</Link></li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="mx-auto mt-10 flex max-w-6xl items-center justify-between gap-3 pt-6 text-xs" style={{ borderTop: "1px solid var(--bt-border)", color: "var(--bt-text-3)" }}>
            <span>© {new Date().getFullYear()} Blocus Tracker</span>
            <span>Créé par Mathias Dock</span>
          </div>
      </footer>
    </div>
  );
}
