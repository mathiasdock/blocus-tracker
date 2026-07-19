import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";
import { useI18n } from "../contexts/I18nContext";
import { COUNTRIES } from "../lib/universities";
import { HOME_FAQ, HOME_FAQ_EN } from "../lib/seo";
import { getLandingContent } from "../lib/landingContent";
import Mascot from "../components/Mascot";

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

// Champs STRUCTURELS uniquement (dimensions, screenshots, liens, ids). Le TEXTE
// vient de lib/landingContent.js, fusionné par langue dans le composant.
const STATS_META = [
  { target: 200, suffix: "+" },
  { target: UNIVERSITY_COUNT, suffix: "" },
  { target: COUNTRY_COUNT, suffix: "" },
  { target: 100, suffix: "%" },
];

const APP_AREAS = [
  { id: "chrono", shot: "chrono-desktop", width: 1920, height: 1088 },
  { id: "planning", shot: "planning-desktop", width: 1400, height: 793 },
  { id: "stats", shot: "stats-desktop", width: 1355, height: 768 },
  { id: "progression", shot: "progression-mobile", width: 359, height: 780, frame: "phone" },
  { id: "social", shot: "social-desktop", width: 1400, height: 793 },
  { id: "communautes", shot: "communautes-desktop", width: 1400, height: 793 },
];

const STUDY_FLOW_META = [
  { number: "01", href: "/planning-revision" },
  { number: "02", href: "/pomodoro" },
  { number: "03", href: "/objectifs-etude" },
  { number: "04", href: "/stats-etude" },
];

const EXTRA_GUIDES_META = [
  { href: "/application-etudiant" },
  { href: "/blocus-belgique" },
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

// Le nombre final reste dans le HTML rendu pour le SEO. Une fois hydrate, il
// repart de zero uniquement quand la bande entre dans le viewport.
function AnimatedCounter({ target, suffix = "" }) {
  const valueRef = useRef(null);

  useEffect(() => {
    const node = valueRef.current;
    if (!node) return undefined;

    const finalValue = `${target.toLocaleString("fr-FR")}${suffix}`;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      node.textContent = finalValue;
      return undefined;
    }

    node.textContent = `0${suffix}`;
    let frame = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const startedAt = performance.now();
        const duration = 980;

        const tick = (now) => {
          const progress = Math.min(1, (now - startedAt) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(target * eased);
          node.textContent = `${current.toLocaleString("fr-FR")}${suffix}`;
          if (progress < 1) frame = window.requestAnimationFrame(tick);
        };

        frame = window.requestAnimationFrame(tick);
      },
      { threshold: 0.35 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [suffix, target]);

  return (
    <span ref={valueRef} aria-hidden="true">
      {target.toLocaleString("fr-FR")}{suffix}
    </span>
  );
}

// Chrono vivant du hero : la promesse du produit qui tourne sous les yeux.
// Le texte est écrit directement sur le nœud (aucun state → aucun re-render),
// l'intervalle s'arrête onglet caché et ne démarre pas en reduced-motion.
function LiveChrono({ label }) {
  const timeRef = useRef(null);

  useEffect(() => {
    const node = timeRef.current;
    if (!node) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined; // reste sur la valeur rendue

    let secs = 24 * 60 + 31;
    const id = setInterval(() => {
      if (document.hidden) return;
      secs += 1;
      const m = String(Math.floor(secs / 60)).padStart(2, "0");
      const s = String(secs % 60).padStart(2, "0");
      node.textContent = `${m}:${s}`;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="bt-demo-chip">
      <span className="bt-live-dot" />
      <span className="text-xs font-semibold" style={{ color: "var(--bt-text-2)" }}>{label}</span>
      <span ref={timeRef} className="font-num text-sm font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>24:31</span>
    </span>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const router = useRouter();

  // Contenu de la langue courante (suit l'appareil) fusionné avec les champs
  // structurels. Le SSG rend le français ; l'anglais s'affiche après hydratation.
  const c = getLandingContent(lang);
  const stats = STATS_META.map((s, i) => ({ ...s, label: c.statLabels[i] }));
  const appAreas = APP_AREAS.map((a) => ({ ...a, ...c.areas[a.id] }));
  const studyFlow = STUDY_FLOW_META.map((s, i) => ({ ...s, ...c.studyFlow[i] }));
  const extraGuides = EXTRA_GUIDES_META.map((g, i) => ({ ...g, ...c.extraGuides[i] }));
  const faq = lang === "en" ? HOME_FAQ_EN : HOME_FAQ;

  const [activeAreaId, setActiveAreaId] = useState(APP_AREAS[0].id);
  const activeArea = appAreas.find((area) => area.id === activeAreaId) || appAreas[0];

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, router, user]);

  // Tilt 3D du cadre hero : on écrit --tilt-x/--tilt-y directement sur le nœud
  // (aucun state, aucun re-render). Souris fine uniquement, jamais en
  // reduced-motion ; retour à plat en sortie (la transition CSS amortit).
  const tiltRef = useRef(null);
  useEffect(() => {
    const el = tiltRef.current;
    if (!el) return undefined;
    const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return undefined;
    const MAX = 3.2; // degrés — assez pour la profondeur, jamais gadget
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--tilt-x", `${(-py * MAX).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(px * MAX).toFixed(2)}deg`);
    };
    const onLeave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Projecteur vert qui suit la souris sur les surfaces .bt-spot (adaptation
  // du "Spotlight Card" reactbits via le MCP 21st). --sx/--sy sont écrits
  // directement sur l'élément survolé : aucun state, aucun re-render.
  useEffect(() => {
    const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return undefined;
    const els = Array.from(document.querySelectorAll(".bt-spot"));
    if (!els.length) return undefined;
    const onMove = (e) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx", `${e.clientX - r.left}px`);
      el.style.setProperty("--sy", `${e.clientY - r.top}px`);
    };
    els.forEach((el) => el.addEventListener("pointermove", onMove));
    return () => els.forEach((el) => el.removeEventListener("pointermove", onMove));
  }, []);

  // La visite guidée se joue toute seule (façon Apple) : onglet suivant toutes
  // les 6,5 s, uniquement quand la section est à l'écran et l'onglet visible.
  // Le premier clic de l'utilisateur reprend la main définitivement.
  const [autoTour, setAutoTour] = useState(true);
  const tourRef = useRef(null);
  useEffect(() => {
    if (!autoTour) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) { setAutoTour(false); return undefined; }
    const section = tourRef.current;
    if (!section) return undefined;
    let visible = false;
    const io = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; }, { threshold: 0.25 });
    io.observe(section);
    const id = setInterval(() => {
      if (!visible || document.hidden) return;
      setActiveAreaId((prev) => {
        const idx = APP_AREAS.findIndex((a) => a.id === prev);
        return APP_AREAS[(idx + 1) % APP_AREAS.length].id;
      });
    }, 6500);
    return () => { clearInterval(id); io.disconnect(); };
  }, [autoTour]);

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
    <div className="min-h-dvh font-display" style={{ backgroundColor: "var(--bt-bg)", color: "var(--bt-text-1)" }}>
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
          <nav className="hidden items-center gap-1 md:flex" aria-label={c.navSectionsAria}>
            {[["fonctionnalites", c.nav.features], ["decouverte", c.nav.discover], ["faq", c.nav.faq]].map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={(e) => scrollToId(e, id)}
                className="rounded-full px-3.5 py-2 text-sm font-medium transition-colors"
                style={{ color: "var(--bt-text-2)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bt-subtle)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}>
                {label}
              </a>
            ))}
          </nav>
          <nav className="flex items-center gap-2" aria-label={c.navMainAria}>
            <Link href="/login" className="inline-flex items-center rounded-full px-4 text-sm font-semibold transition-colors"
              style={{ minHeight: 44, color: "var(--bt-text-1)", backgroundColor: "var(--bt-subtle)", border: "1px solid var(--bt-border)" }}>
              {c.nav.login}
            </Link>
            <Link href="/signup" className="hidden items-center rounded-full px-4 text-sm font-semibold text-white sm:inline-flex"
              style={{ minHeight: 44, backgroundImage: "linear-gradient(165deg, #14B885, #0E8F68 115%)", boxShadow: "0 6px 18px rgba(20,184,133,0.28)" }}>
              {c.nav.signup}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero — centré, gros type, vrai produit dessous ─────────────── */}
        <section className="relative overflow-hidden">
          {/* Fond vivant : halo statique (base) + aurora de marque qui dérive */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div style={{ position: "absolute", top: -220, left: "50%", transform: "translateX(-50%)", width: 900, height: 620, background: "radial-gradient(closest-side, rgba(20,184,133,0.13), transparent 72%)" }} />
            <div className="bt-aurora"><i /><i /><i /></div>
          </div>

          <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 text-center sm:pt-20">
            <div className="bt-stagger mx-auto max-w-3xl">
              <p className="mx-auto inline-flex rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wide"
                style={{ color: "var(--bt-accent-dark)", backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
                {c.hero.badge}
              </p>
              <h1 className="mt-6 text-[2.7rem] leading-[1.03] sm:text-6xl lg:text-7xl" style={{ color: "var(--bt-text-1)", letterSpacing: "-0.03em" }}>
                {c.hero.titleBefore}<span className="bt-shimmer-accent">{c.hero.titleAccent}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--bt-text-2)" }}>
                {c.hero.subtitle}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className="btn-primary btn-shine justify-center px-7 py-3.5 text-sm">
                  {c.hero.tryTimer}
                </Link>
                <Link href="/signup" className="btn-ghost justify-center px-7 py-3.5 text-sm" style={{ backgroundColor: "var(--bt-surface)" }}>
                  {c.hero.createSpace}
                </Link>
              </div>
            </div>

            {/* Vrai produit : desktop encadré (tilt 3D au survol) + mobile
                flottant + fragments d'UI vivants — le produit se démontre
                tout seul : chrono qui tourne, XP qui tombe, série qui tient. */}
            <div className="relative mx-auto mt-14 max-w-4xl sm:mt-16" data-reveal="zoom">
              <div ref={tiltRef} className="bt-tilt">
                <BrowserFrame src={SHOT("chrono-desktop")} alt={c.hero.desktopAlt} width={1920} height={1088} priority />
              </div>
              {/* Mascotte perchée sur le cadre — elle respire, cligne et remue
                  la queue (état heureux). Décorative pour les lecteurs d'écran. */}
              <div aria-hidden="true" className="absolute left-[7%] -top-[50px] h-14 w-14 sm:-top-[71px] sm:h-20 sm:w-20">
                <Mascot streak={12} size={80} className="h-full w-full" />
              </div>
              {/* Série vivante, posée à côté de la mascotte (desktop) */}
              <div aria-hidden="true" className="bt-plx absolute left-[19%] -top-[38px] hidden sm:block" style={{ "--plx": "16px" }}>
                <span className="bt-demo-chip">
                  <span className="text-sm leading-none">🔥</span>
                  <span className="font-num text-sm font-bold tabular-nums" style={{ color: "var(--bt-text-1)" }}>12</span>
                </span>
              </div>
              {/* Chrono qui tourne vraiment — coin haut droit du cadre */}
              <div aria-hidden="true" className="bt-plx absolute -top-4 right-[3%] sm:-top-5" style={{ "--plx": "26px" }}>
                <LiveChrono label={c.hero.chipChrono} />
              </div>
              {/* +XP qui tombe en boucle — bord gauche du cadre */}
              <div aria-hidden="true" className="bt-plx absolute -left-2 top-[42%] sm:-left-9" style={{ "--plx": "-18px" }}>
                <span className="bt-demo-chip bt-xp-loop">
                  <span className="text-sm font-bold" style={{ color: "var(--bt-accent-dark)" }}>+45 XP</span>
                </span>
              </div>
              {/* Téléphone : parallax (extérieur) + flottement (intérieur) */}
              <div className="bt-plx absolute -right-3 bottom-[-9%] w-[136px] sm:-right-8 sm:w-[190px]" style={{ "--plx": "-34px" }}>
                <div className="bt-float" style={{ "--float-rot": "2deg" }}>
                  <PhoneFrame src={SHOT("chrono-mobile")} alt={c.hero.mobileAlt} width={359} height={780} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Chiffres réels — bande fine, pas de cartes ─────────────────── */}
        <section className="px-5 pb-4 pt-14 sm:pt-20">
          <dl className="mx-auto grid max-w-4xl grid-cols-2 gap-y-8 sm:grid-cols-4" data-reveal>
            {stats.map((s, i) => (
              <div key={s.label} className="px-4 text-center sm:text-left"
                style={i > 0 ? { borderLeft: "1px solid var(--bt-border)" } : {}}>
                <dd className="font-num text-3xl font-bold tabular-nums sm:text-4xl"
                  aria-label={`${s.target.toLocaleString("fr-FR")}${s.suffix} ${s.label}`}
                  style={{ color: "var(--bt-text-1)" }}>
                  <AnimatedCounter target={s.target} suffix={s.suffix} />
                </dd>
                <dt className="mt-1 text-xs sm:text-sm" style={{ color: "var(--bt-text-3)" }}>{s.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Mode focus — pleine largeur, surface ink ───────────────────── */}
        <section id="fonctionnalites" className="scroll-mt-24 px-5 py-14 sm:py-20">
          <div className="card-ink bt-grain mx-auto max-w-6xl overflow-hidden rounded-[28px] sm:rounded-[36px]" data-reveal="zoom">
            <div className="relative z-10 grid items-center gap-10 p-7 sm:p-12 lg:grid-cols-2 lg:gap-14">
              <div>
                <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-ink-text)" }}>
                  {c.focus.title}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-ink-muted)" }}>
                  {c.focus.text}
                </p>
                <ul className="mt-6 space-y-3">
                  {c.focus.list.map((li) => (
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
                <Image src={SHOT("focus-desktop")} alt={c.focus.alt} width={1600} height={908}
                  sizes="(min-width: 1024px) 520px, 100vw" className="h-auto w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Planning — split image / texte ─────────────────────────────── */}
        <section className="px-5 py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div data-reveal="zoom" className="order-2 lg:order-1">
              <div className="bt-plx" style={{ "--plx": "14px" }}>
                <BrowserFrame src={SHOT("planning-desktop")} alt={c.planning.alt} width={1400} height={793} />
              </div>
            </div>
            <div data-reveal className="order-1 lg:order-2" style={{ "--rv-delay": "0.08s" }}>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                {c.planning.title}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                {c.planning.text}
              </p>
              <ul className="mt-6 space-y-3">
                {c.planning.list.map((li) => (
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
                {c.statsSection.title}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                {c.statsSection.text}
              </p>
              <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                style={{ color: "var(--bt-accent-dark)" }}>
                {c.statsSection.link} <IconArrow size={15} />
              </Link>
            </div>
            <div className="relative" data-reveal="zoom" style={{ "--rv-delay": "0.08s" }}>
              <div className="bt-plx" style={{ "--plx": "14px" }}>
                <BrowserFrame src={SHOT("stats-desktop")} alt={c.statsSection.alt} width={1355} height={768} />
              </div>
              {/* L'encart classement dérive à contre-sens du grand cadre → profondeur */}
              <div className="bt-plx absolute -bottom-8 -left-3 w-[46%] sm:-left-8" style={{ "--plx": "-12px" }}>
                <div className="overflow-hidden rounded-xl"
                  style={{ border: "1px solid var(--bt-border)", boxShadow: "0 18px 44px var(--bt-shadow)", transform: "rotate(-2deg)" }}>
                  <Image src={SHOT("classement-desktop")} alt={c.statsSection.overlayAlt} width={1100} height={623}
                    sizes="(min-width: 1024px) 260px, 45vw" className="h-auto w-full" />
                </div>
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
                  {c.social.title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                  {c.social.text}
                </p>
              </div>

              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                {[
                  { shot: "social-desktop", alt: c.social.socialAlt, caption: c.social.captions[0] },
                  { shot: "communautes-desktop", alt: c.social.communautesAlt, caption: c.social.captions[1] },
                ].map((fig, i) => (
                  <figure key={fig.shot} data-reveal="zoom" style={{ "--rv-delay": `${i * 0.08}s` }}>
                    <div className="bt-plx" style={{ "--plx": `${i === 0 ? 12 : -12}px` }}>
                      <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--bt-border)", boxShadow: "0 18px 50px var(--bt-shadow)" }}>
                        <Image src={SHOT(fig.shot)} alt={fig.alt} width={1400} height={793}
                          sizes="(min-width: 1024px) 520px, 100vw" className="h-auto w-full" />
                      </div>
                    </div>
                    <figcaption className="mt-3 text-center text-xs font-medium" style={{ color: "var(--bt-text-3)" }}>{fig.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            {/* Marquee des vraies écoles (même source que l'app) */}
            <div className="pb-8">
              <p className="mb-5 text-center text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-accent-dark)" }}>
                {c.social.marquee(UNIVERSITY_COUNT, COUNTRY_COUNT)}
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

        {/* ── Visite interactive — toutes les grandes pages de l'app ─────── */}
        <section id="decouverte" ref={tourRef} className="scroll-mt-24 overflow-hidden px-5 py-14 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid items-end gap-7 lg:grid-cols-[1fr_auto]" data-reveal>
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-accent-dark)" }}>
                  {c.tour.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                  {c.tour.title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                  {c.tour.text}
                </p>
              </div>
              <Link href="/signup" className="btn-primary justify-center px-6 py-3 text-sm">
                {c.tour.cta}
              </Link>
            </div>

            <div className="mt-9 flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }} role="tablist" aria-label={c.tour.tablistAria} data-reveal>
              {appAreas.map((area) => {
                const active = area.id === activeArea.id;
                return (
                  <button key={area.id} type="button" role="tab" aria-selected={active}
                    aria-controls="product-tour-panel"
                    onClick={() => { setAutoTour(false); setActiveAreaId(area.id); }}
                    className="relative shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors"
                    style={{
                      color: active ? "#fff" : "var(--bt-text-2)",
                      backgroundColor: active ? "var(--bt-accent)" : "var(--bt-surface)",
                      border: `1px solid ${active ? "var(--bt-accent)" : "var(--bt-border)"}`,
                    }}>
                    {area.label}
                    {/* Barre de lecture : la visite avance toute seule jusqu'au
                        premier clic (key = relance l'animation à chaque étape) */}
                    {active && autoTour && <span className="bt-tab-bar" key={activeArea.id} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div id="product-tour-panel" role="tabpanel" className="bt-spot mt-5 grid overflow-hidden rounded-[28px] lg:grid-cols-[0.72fr_1.28fr]"
              style={{ backgroundColor: "var(--bt-surface)", border: "1px solid var(--bt-border)", boxShadow: "0 20px 60px var(--bt-shadow)" }}>
              <div className="flex min-w-0 flex-col p-6 sm:p-9 lg:p-10" aria-live="polite">
                <div className="flex items-end gap-3">
                  <Mascot streak={activeArea.id === "progression" ? 30 : 12} size={92} className="h-20 w-20 shrink-0" />
                  <div className="relative mb-3 min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)", color: "var(--bt-text-2)" }}>
                    <span aria-hidden="true" className="absolute -left-2 bottom-4 h-4 w-4 rotate-45"
                      style={{ backgroundColor: "var(--bt-accent-bg)", borderBottom: "1px solid var(--bt-accent-border)", borderLeft: "1px solid var(--bt-accent-border)" }} />
                    <span className="relative">{activeArea.mascot}</span>
                  </div>
                </div>

                <div key={activeArea.id} className="bt-tab-fade mt-6">
                  <p className="font-num text-xs font-bold tabular-nums" style={{ color: "var(--bt-text-3)" }}>
                    {String(appAreas.indexOf(activeArea) + 1).padStart(2, "0")} / {String(appAreas.length).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 text-2xl sm:text-3xl" style={{ color: "var(--bt-text-1)" }}>{activeArea.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{activeArea.description}</p>
                  <ul className="mt-6 space-y-3">
                    {activeArea.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--bt-text-1)" }}>
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                          style={{ color: "var(--bt-accent-dark)", backgroundColor: "var(--bt-accent-bg)" }}>
                          <IconCheck size={11} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto flex flex-wrap gap-3 pt-8">
                  <Link href="/dashboard" className="btn-ghost px-4 py-2.5 text-sm">{c.tour.tryTimer}</Link>
                  <Link href="/signup" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bt-accent-dark)" }}>
                    {c.tour.unlockAll} <IconArrow size={14} />
                  </Link>
                </div>
              </div>

              <div className="flex min-h-[360px] items-center justify-center overflow-hidden p-5 sm:min-h-[520px] sm:p-8"
                style={{ backgroundColor: "var(--bt-subtle)", borderLeft: "1px solid var(--bt-border)" }}>
                <div key={`shot-${activeArea.id}`} className="bt-tab-fade w-full">
                  {activeArea.frame === "phone" ? (
                    <div className="mx-auto w-[210px] sm:w-[250px]">
                      <PhoneFrame src={SHOT(activeArea.shot)} alt={activeArea.alt} width={activeArea.width} height={activeArea.height} />
                    </div>
                  ) : (
                    <BrowserFrame src={SHOT(activeArea.shot)} alt={activeArea.alt} width={activeArea.width} height={activeArea.height} />
                  )}
                </div>
              </div>
            </div>

            <p className="mt-7 text-center text-sm" style={{ color: "var(--bt-text-3)" }} data-reveal>
              {c.tour.footnote}
            </p>
          </div>
        </section>

        {/* ── Méthode — les guides SEO replacés dans le vrai parcours ────── */}
        <section id="guides" className="scroll-mt-24 px-5 py-14 sm:py-20"
          style={{ backgroundColor: "var(--bt-surface)", borderTop: "1px solid var(--bt-border)", borderBottom: "1px solid var(--bt-border)" }}>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl" data-reveal>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-accent-dark)" }}>
                {c.method.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>
                {c.method.title}
              </h2>
              <p className="mt-4 text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-text-2)" }}>
                {c.method.text}
              </p>
            </div>

            <ol className="mt-10 grid gap-x-8 gap-y-0 md:grid-cols-2">
              {studyFlow.map((step, i) => (
                <li key={step.number} className="bt-spot grid grid-cols-[auto_1fr] gap-4 py-7"
                  style={{ borderTop: "1px solid var(--bt-border)", "--rv-delay": `${(i % 2) * 0.07}s` }} data-reveal>
                  <span className="font-num text-sm font-bold tabular-nums" style={{ color: "var(--bt-accent-dark)" }}>{step.number}</span>
                  <div>
                    <h3 className="text-xl" style={{ color: "var(--bt-text-1)" }}>{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{step.text}</p>
                    <p className="mt-4 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>{step.app}</p>
                    <Link href={step.href} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bt-accent-dark)" }}>
                      {step.link} <IconArrow size={14} />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-7 grid gap-3 sm:grid-cols-2" data-reveal>
              {extraGuides.map((guide) => (
                <Link key={guide.href} href={guide.href} className="group bt-spot flex items-center justify-between gap-5 rounded-2xl p-5 transition-colors"
                  style={{ backgroundColor: "var(--bt-bg)", border: "1px solid var(--bt-border)" }}>
                  <span>
                    <span className="block text-base font-semibold" style={{ color: "var(--bt-text-1)" }}>{guide.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{guide.text}</span>
                  </span>
                  <span className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: "var(--bt-text-3)" }}>
                    <IconArrow />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ — accordéon natif ──────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-24 px-5 py-14 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-reveal>
              <h2 className="text-3xl leading-tight sm:text-4xl" style={{ color: "var(--bt-text-1)" }}>{c.faqSection.title}</h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>
                {c.faqSection.text}
              </p>
              <div className="mt-7 rounded-2xl p-5" style={{ backgroundColor: "var(--bt-accent-bg)", border: "1px solid var(--bt-accent-border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--bt-text-1)" }}>{c.faqSection.boxTitle}</p>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--bt-text-2)" }}>{c.faqSection.boxText}</p>
                <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bt-accent-dark)" }}>
                  {c.faqSection.boxLink} <IconArrow size={14} />
                </Link>
              </div>
            </div>
            <div className="space-y-3" data-reveal style={{ "--rv-delay": "0.08s" }}>
              {faq.map((item) => (
                <details key={item.q} className="group bt-acc rounded-2xl px-5"
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
            {/* Faisceau vert qui parcourt la bordure (Border Beam via MCP 21st) */}
            <div className="bt-beam z-[5]" aria-hidden="true" />
            <div className="relative z-10 mx-auto max-w-xl">
              {/* Mascotte en feu — rebond + flamme qui vacille, l'énergie du CTA */}
              <div aria-hidden="true" className="mb-5 flex justify-center">
                <Mascot streak={30} size={92} />
              </div>
              <h2 className="text-3xl sm:text-4xl" style={{ color: "var(--bt-ink-text)" }}>
                {c.cta.title}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed sm:text-base" style={{ color: "var(--bt-ink-muted)" }}>
                {c.cta.text}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className="btn-shine inline-flex items-center justify-center rounded-[14px] px-7 py-3.5 text-sm font-semibold"
                  style={{ backgroundColor: "#fff", color: "#0E8F68", minHeight: 44 }}>
                  {c.cta.tryTimer}
                </Link>
                <Link href="/signup" className="inline-flex items-center justify-center rounded-[14px] px-7 py-3.5 text-sm font-semibold"
                  style={{ minHeight: 44, color: "var(--bt-ink-text)", border: "1px solid var(--bt-ink-border)", backgroundColor: "rgba(255,255,255,0.06)" }}>
                  {c.cta.createSpace}
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
                {c.footer.tagline}
              </p>
            </div>
            <nav aria-label={c.footer.productAria}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>{c.footer.productHead}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {c.footer.productLinks.map(([href, label]) => (
                  <li key={href}><Link href={href} className="transition-colors hover:underline" style={{ color: "var(--bt-text-2)" }}>{label}</Link></li>
                ))}
              </ul>
            </nav>
            <nav aria-label={c.footer.resourcesAria}>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-text-3)" }}>{c.footer.resourcesHead}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {c.footer.resourceLinks.map(([href, label]) => (
                  <li key={href}><Link href={href} className="transition-colors hover:underline" style={{ color: "var(--bt-text-2)" }}>{label}</Link></li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="mx-auto mt-10 flex max-w-6xl items-center justify-between gap-3 pt-6 text-xs" style={{ borderTop: "1px solid var(--bt-border)", color: "var(--bt-text-3)" }}>
            <span>© {new Date().getFullYear()} Blocus Tracker</span>
            <span>{c.footer.credit}</span>
          </div>
      </footer>
    </div>
  );
}
