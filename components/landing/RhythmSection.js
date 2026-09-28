import { useEffect, useRef, useState } from "react";
import Mascot from "../Mascot";
import StreakEmblem from "../StreakEmblem";
import { useI18n } from "../../contexts/I18nContext";
import s from "./Landing.module.css";

// « Garde le rythme. » La vraie règle de la mascotte (lib/mascotMotion.mjs,
// mascotState) : endormie à 0 jour, bien partie de 1 à 6, en pleine forme de
// 7 à 29, en feu à partir de 30. Le compteur avance avec le défilement, selon
// la place de la mascotte à l'écran ; chaque étape reste un bouton, et le
// premier choix de l'utilisateur arrête l'avance automatique.
const STOPS = [0, 1, 7, 30];
const CAPTIONS = ["mascot.asleep", "mascot.content", "mascot.happy", "mascot.fired"];
// Position du centre de la mascotte dans la hauteur d'écran → étape.
const THRESHOLDS = [0.7, 0.55, 0.4];

export default function RhythmSection({ c }) {
  const { t } = useI18n();
  // Rendu serveur, sans JavaScript ou en mouvement réduit : 7 jours.
  const [index, setIndex] = useState(2);
  const stageRef = useRef(null);
  const manualRef = useRef(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    let visible = false;
    const measure = () => {
      frame = 0;
      if (manualRef.current) return;
      const rect = stage.getBoundingClientRect();
      const center = (rect.top + rect.height / 2) / window.innerHeight;
      const next = THRESHOLDS.findIndex((limit) => center > limit);
      setIndex(next === -1 ? STOPS.length - 1 : next);
    };
    const onScroll = () => { if (visible && !frame) frame = window.requestAnimationFrame(measure); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) onScroll();
    });
    observer.observe(stage);
    window.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const choose = (i) => {
    manualRef.current = true;
    setIndex(i);
  };

  const days = STOPS[index];
  return (
    <section className={s.section} aria-labelledby="rhythm-title">
      <div className={`${s.container} ${s.rhythm}`}>
        <div className={s.rhythmHead}>
          <h2 id="rhythm-title" className={`${s.h2} ${s.display}`}>{c.title}</h2>
          <p className={s.sectionLead}>{c.text}</p>
        </div>
        <div className={s.rhythmControls}>
          <div className={s.stops} role="group" aria-label={c.stopsAria} style={{ "--progress": index / (STOPS.length - 1) }}>
            <span className={s.stopsFill} aria-hidden="true" />
            {STOPS.map((n, i) => (
              <button key={n} type="button" className={s.stop} aria-pressed={i === index}
                data-reached={i <= index} onClick={() => choose(i)}>
                <span className={s.stopDot} aria-hidden="true" />
                <span className={s.stopDays}>{c.days(n)}</span>
                <span className={s.stopLabel}>{t(CAPTIONS[i])}</span>
              </button>
            ))}
          </div>
          <p className={s.rhythmNote}>{c.note}</p>
        </div>
        <div ref={stageRef} className={s.rhythmStage}>
          <div className={s.rhythmMascot} aria-hidden="true">
            <Mascot streak={days} size={176} />
          </div>
          <div className={s.readout}>
            <StreakEmblem days={days} size={48} />
            <span className={s.readoutText}>
              <span className={s.readoutDays}>{c.days(days)}</span>
              <span className={s.readoutCaption}>{t(CAPTIONS[index])}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
