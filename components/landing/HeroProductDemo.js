import { useEffect, useRef } from "react";
import s from "./Landing.module.css";

// Captures du vrai Chrono avec la fixture hors ligne : aucun état produit,
// compte ou minuterie réelle n'est monté dans la page publique.
function DemoFrame({ lang, frame, className, alt = "", priority = false }) {
  const locale = lang === "en" ? "en" : "fr";
  const root = `/site-web/hero-demo/${locale}/${frame}`;
  return (
    <picture className={className}>
      <source media="(max-width: 639px)"
        srcSet={`${root}-mobile-600.webp 600w, ${root}-mobile-900.webp 900w`}
        sizes="76vw" width="900" height="1948" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${root}-desktop-1600.webp`}
        srcSet={`${root}-desktop-1100.webp 1100w, ${root}-desktop-1600.webp 1600w`}
        sizes="(min-width: 1100px) 1020px, 92vw"
        width="1600" height="1000" alt={alt}
        loading={priority ? "eager" : "lazy"} decoding="async"
        fetchpriority={priority ? "high" : undefined} />
    </picture>
  );
}

export default function HeroProductDemo({ lang, alt }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window)) return undefined;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let ready = false;
    let loading = false;
    let disposed = false;

    const update = () => {
      root.dataset.demoRunning = String(ready && visible && !document.hidden && !reduced.matches);
    };
    const loadFrames = () => {
      if (loading) return;
      loading = true;
      const images = [...root.querySelectorAll("img")];
      Promise.all(images.map((img) => {
        if (img.loading === "lazy") img.loading = "eager";
        if (img.complete && img.naturalWidth) return Promise.resolve();
        if (img.decode) return img.decode().catch(() => {});
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      })).then(() => {
        if (disposed) return;
        ready = true;
        update();
      });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry && entry.intersectionRatio >= 0.25);
      if (visible && !reduced.matches) loadFrames();
      update();
    }, { threshold: [0, 0.25, 0.5] });
    observer.observe(root);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener?.("change", update);
    update();

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener?.("change", update);
    };
  }, []);

  return (
    <div ref={ref} className={s.screen} data-demo-running="false">
      <DemoFrame lang={lang} frame="active" className={s.demoBase} alt={alt} priority />
      <DemoFrame lang={lang} frame="tick-1" className={s.demoTickOne} />
      <DemoFrame lang={lang} frame="tick-2" className={s.demoTickTwo} />
      <DemoFrame lang={lang} frame="focus" className={s.demoFocus} />
      <DemoFrame lang={lang} frame="progress" className={s.demoProgress} />
      <DemoFrame lang={lang} frame="reward" className={s.demoReward} />
      <span className={s.demoFocusPress} aria-hidden="true" />
      <span className={s.demoFinishPress} aria-hidden="true" />
    </div>
  );
}
