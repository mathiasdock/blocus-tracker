"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import styles from "./FloatingNav.module.css";

// La barre d'onglets d'iOS 26 (app Horloge, captures de Mathias du
// 2026-10-01) : une capsule de verre transparente ; l'onglet actif posé sur
// une bulle neutre et transparente, seuls son icône et son nom en vert. Au
// toucher, la bulle se soulève en lentille de verre — plus grande que la
// barre, elle grossit et colore en vert ce qu'elle survole —, glisse avec un
// léger rebond en s'étirant quand elle va vite, puis se repose.
// Approximation web : Safari ne sait pas réfracter ce qu'il y a derrière ; le
// verre est fait de transparence, de reflets, d'une ombre et d'une copie
// grossie des onglets vue à travers la lentille.
//
// Les onglets qu'on VOIT sont des copies (aria-hidden) : celle de la lentille
// (en vert) et deux « fenêtres » de part et d'autre (couleur normale), dont
// les bords suivent ceux de la lentille. Ce qui passe sous la lentille
// n'apparaît donc jamais en double. Les vrais liens, invisibles mais à leur
// place, gardent les taps, le clavier et les lecteurs d'écran.
//
// La barre est reconstruite à chaque page (le Layout appartient à la page).
// Le trajet en cours vit donc ici, hors de React : la barre de la nouvelle
// page le reprend exactement où l'ancienne l'a laissé, sans à-coup.
const trip = { index: -1, from: 0, to: 0, fromLift: 0, velocity: 0, startedAt: -Infinity, leftAt: -Infinity };

const DURATION = 480;        // ms, du décollage au repos
const SAMPLES = 36;          // images clés calculées (interpolées entre elles)
const OMEGA = 16;            // ressort : vitesse propre (rad/s)
const ZETA = 0.74;           // ressort : amortissement (< 1 → léger dépassement)
const LIFT_X = 0.12;         // la lentille : +12 % en largeur…
const LIFT_Y = 0.3;          // … et +30 % en hauteur, plus haute que la barre
const STRETCH_MAX = 0.2;     // étirement maximal à pleine vitesse
const LIFT_IN_MS = 110;
const LAND_FROM_MS = 290;
// La bulle s'efface quand le verre arrive et revient quand il se repose.
const GLASS_IN_MS = 70;
const BUBBLE_OUT = [20, 90];
const BUBBLE_IN = [320, 440];
const GLASS_OUT = [340, 480];
const WINDOW_SPAN = 10;      // largeur d'une fenêtre, en onglets
const SAME_GESTURE_MS = 900; // barre quittée il y a moins : même geste, on glisse

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const smooth = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const between = (ms, [start, end]) => smooth((ms - start) / (end - start));

// Ressort amorti : 0 → 1 avec un petit dépassement, t en secondes, v la
// vitesse de départ (en trajets par seconde) — un trajet repris en route
// garde son élan au lieu de repartir de l'arrêt.
function spring(t, v = 0) {
  const wd = OMEGA * Math.sqrt(1 - ZETA * ZETA);
  const decay = Math.exp(-ZETA * OMEGA * t);
  return 1 - decay * (Math.cos(wd * t) + ((ZETA * OMEGA - v) / wd) * Math.sin(wd * t));
}

// Soulèvement : 0 au repos, 1 lentille. Un trajet repris en route part du
// soulèvement où il en était, sans retomber.
function liftAt(ms, fromLift = 0) {
  const curve = smooth(ms / LIFT_IN_MS) * (1 - smooth((ms - LAND_FROM_MS) / (DURATION - LAND_FROM_MS)));
  return Math.max(curve, fromLift * (1 - smooth(ms / LIFT_IN_MS)));
}

function glassAt(ms, fromLift = 0) {
  const curve = smooth(ms / GLASS_IN_MS) * (1 - between(ms, GLASS_OUT));
  return Math.max(curve, fromLift * (1 - between(ms, GLASS_OUT)));
}

function bubbleAt(ms, fromLift = 0) {
  return Math.min(1, (1 - between(ms, BUBBLE_OUT)) * (1 - fromLift) + between(ms, BUBBLE_IN));
}

// Position (en rangs d'onglet) et vitesse (rangs par seconde) d'un trajet.
function positionAt(from, to, ms, velocity = 0) {
  const distance = to - from;
  return distance ? from + distance * spring(ms / 1000, velocity / distance) : to;
}
const velocityAt = (from, to, ms, velocity = 0) =>
  (positionAt(from, to, ms + 1, velocity) - positionAt(from, to, ms - 1, velocity)) * 500;

const pct = (value) => `${value.toFixed(3)}%`;

// Bords gauche et droit de la lentille (en onglets) → transformations des
// deux fenêtres et de leurs copies, qui restent alignées sur les vrais onglets.
function windowFrames(left, right) {
  return {
    left: `translateX(${pct((left - WINDOW_SPAN) * (100 / WINDOW_SPAN))})`,
    leftCopy: `translateX(${pct((WINDOW_SPAN - left) * 20)})`,
    right: `translateX(${pct(right * (100 / WINDOW_SPAN))})`,
    rightCopy: `translateX(${pct(-right * 20)})`,
  };
}

// Toutes les images clés d'un trajet, déterministes : l'ancienne et la
// nouvelle barre calculent exactement les mêmes.
function tripFrames(from, to, fromLift, velocity) {
  const frames = { pill: [], copy: [], glass: [], bubble: [], left: [], leftCopy: [], right: [], rightCopy: [] };
  for (let step = 0; step <= SAMPLES; step += 1) {
    const offset = step / SAMPLES;
    const ms = offset * DURATION;
    const position = positionAt(from, to, ms, velocity);
    const speed = Math.abs(velocityAt(from, to, ms, velocity)) / 1000; // rangs par ms
    const lift = liftAt(ms, fromLift);
    const stretch = Math.min(STRETCH_MAX, speed * 9) * lift;
    const scaleX = 1 + LIFT_X * lift + stretch;
    const scaleY = 1 + LIFT_Y * lift - stretch * 0.35;
    const windows = windowFrames(position + 0.5 - scaleX / 2, position + 0.5 + scaleX / 2);
    frames.pill.push({ offset, transform: `translateX(${pct(position * 100)}) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})` });
    // La copie vue à travers la lentille recule d'autant : elle reste alignée
    // sur les vrais onglets, et le grossissement de la lentille la grossit.
    frames.copy.push({ offset, transform: `translateX(${pct(-position * 20)})` });
    frames.left.push({ offset, transform: windows.left });
    frames.leftCopy.push({ offset, transform: windows.leftCopy });
    frames.right.push({ offset, transform: windows.right });
    frames.rightCopy.push({ offset, transform: windows.rightCopy });
    frames.glass.push({ offset, opacity: glassAt(ms, fromLift).toFixed(3) });
    frames.bubble.push({ offset, opacity: bubbleAt(ms, fromLift).toFixed(3) });
  }
  return frames;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function TabFace({ item }) {
  return (
    <>
      <span className={styles.icon}>
        {item.icon}
        {item.badge}
      </span>
      <span className={styles.label}>{item.label}</span>
    </>
  );
}

function Copies({ items }) {
  return items.map((item) => (
    <span key={item.href} className={styles.copyItem}>
      <TabFace item={item} />
    </span>
  ));
}

// Controlled by the current route. The selection starts moving as soon as a
// tab is tapped, while aria-current always reflects the actual destination.
export default function FloatingNav({ items, activeIndex, label }) {
  const router = useRouter();
  const trackRef = useRef(null);
  const layers = useRef({});
  const targetRef = useRef(activeIndex);
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  const layer = (name) => (node) => {
    layers.current[name] = node;
  };

  // Joue le trajet from → to, déjà avancé de `elapsed` ms (reprise après le
  // changement de page). Le repos (variable --i) est posé sur la destination :
  // l'animation finie, tout y reste de soi-même.
  const play = useCallback((from, to, elapsed = 0, fromLift = 0, velocity = 0) => {
    const track = trackRef.current;
    if (!track || to < 0) return;
    targetRef.current = to;
    track.style.setProperty("--i", String(to));
    const nodes = layers.current;
    Object.values(nodes).forEach((node) => node?.getAnimations?.().forEach((animation) => animation.cancel()));
    if (from === to || reducedMotion() || typeof track.animate !== "function") return;
    const frames = tripFrames(from, to, fromLift, velocity);
    const timing = { duration: DURATION, easing: "linear", fill: "none" };
    const run = (node, keyframes) => {
      if (!node) return;
      const animation = node.animate(keyframes, timing);
      animation.currentTime = Math.min(elapsed, DURATION);
    };
    run(nodes.pill, frames.pill);
    run(nodes.copy, frames.copy);
    run(nodes.left, frames.left);
    run(nodes.leftCopy, frames.leftCopy);
    run(nodes.right, frames.right);
    run(nodes.rightCopy, frames.rightCopy);
    run(nodes.bubble, frames.bubble);
    run(nodes.glassBody, frames.glass);
    run(nodes.glassRim, frames.glass);
    run(nodes.glassEdge, frames.glass);
  }, []);

  // Part de l'endroit où la lentille SE TROUVE (en plein trajet si besoin).
  const travel = useCallback((to) => {
    const now = performance.now();
    const elapsed = now - trip.startedAt;
    const moving = elapsed < DURATION && trip.to === targetRef.current;
    const from = moving ? positionAt(trip.from, trip.to, elapsed, trip.velocity) : targetRef.current;
    const fromLift = moving ? liftAt(elapsed, trip.fromLift) : 0;
    const velocity = moving ? velocityAt(trip.from, trip.to, elapsed, trip.velocity) : 0;
    if (from < 0 || to < 0 || from === to) {
      targetRef.current = to;
      if (to >= 0) trackRef.current?.style.setProperty("--i", String(to));
      trip.index = to;
      return;
    }
    Object.assign(trip, { index: to, from, to, fromLift, velocity, startedAt: now });
    play(from, to, 0, fromLift, velocity);
  }, [play]);

  // Nouvelle barre (nouvelle page) : reprendre le trajet en cours, ou glisser
  // depuis l'onglet de la page qu'on vient de quitter.
  useIsomorphicLayoutEffect(() => {
    const now = performance.now();
    if (activeIndex >= 0 && trip.to === activeIndex && now - trip.startedAt < DURATION) {
      play(trip.from, trip.to, now - trip.startedAt, trip.fromLift, trip.velocity);
    } else if (activeIndex >= 0 && trip.index >= 0 && trip.index !== activeIndex && now - trip.leftAt < SAME_GESTURE_MS) {
      Object.assign(trip, { from: trip.index, to: activeIndex, fromLift: 0, velocity: 0, startedAt: now });
      play(trip.from, activeIndex, 0, 0, 0);
    }
    trip.index = activeIndex;
    return () => {
      trip.leftAt = performance.now();
    };
    // Une seule fois par barre : la suite passe par l'effet ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (targetRef.current !== activeIndex) travel(activeIndex);
  }, [activeIndex, travel]);

  // Navigation refusée ou interrompue : la sélection revient à sa vraie place.
  useEffect(() => {
    const restore = () => {
      if (targetRef.current !== activeRef.current) travel(activeRef.current);
    };
    router.events.on("routeChangeError", restore);
    return () => router.events.off("routeChangeError", restore);
  }, [router, travel]);

  const selected = activeIndex >= 0;

  return (
    <nav className="bt-nav lg:hidden" aria-label={label}>
      <div ref={trackRef} className={`bt-nav-bar ${styles.track}`} data-selection={selected ? "" : undefined}
        style={selected ? { "--i": activeIndex } : undefined}>
        {selected && (
          <>
            <span ref={layer("left")} aria-hidden="true" data-part="window" className={`${styles.window} ${styles.windowLeft}`}>
              <span ref={layer("leftCopy")} className={styles.windowCopy}><Copies items={items} /></span>
            </span>
            <span ref={layer("right")} aria-hidden="true" data-part="window" className={`${styles.window} ${styles.windowRight}`}>
              <span ref={layer("rightCopy")} className={styles.windowCopy}><Copies items={items} /></span>
            </span>
            <span ref={layer("pill")} aria-hidden="true" data-part="selection" className={styles.indicator}>
              <span ref={layer("bubble")} className={styles.bubble} />
              <span ref={layer("glassBody")} className={styles.glassBody} />
              <span className={styles.lens}>
                <span ref={layer("copy")} className={styles.copy}><Copies items={items} /></span>
              </span>
              <span ref={layer("glassRim")} className={styles.glassRim} />
              <span ref={layer("glassEdge")} className={styles.glassEdge} />
            </span>
          </>
        )}
        {items.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activeIndex === index ? "page" : undefined}
            className={styles.item}
            onClick={(event) => {
              if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                travel(index);
              }
            }}
          >
            <TabFace item={item} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
