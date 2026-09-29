import { useEffect, useState } from "react";
import Mascot from "../Mascot";
import HeroProductDemo from "./HeroProductDemo";
import s from "./Landing.module.css";

// L'écran du hero : le vrai Chrono (ordinateur, ou téléphone sous 640 px),
// incliné au chargement puis redressé par le défilement (CSS, voir
// Landing.module.css). La mascotte est assise sur son bord : elle lit tant
// que l'écran est incliné, puis lève les yeux et fait un signe une seule fois
// quand il s'est redressé. Le mouvement appartient à son moteur
// (lib/mascotMotion.mjs) : hors écran, onglet caché ou mouvement réduit, il
// s'arrête de lui-même.
export default function HeroDevice({ lang, alt }) {
  const [mood, setMood] = useState("focused");

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      // L'inclinaison se termine à 65 % de la hauteur d'écran défilée ; le
      // signe arrive juste avant, quand l'écran est presque droit.
      if (window.scrollY < window.innerHeight * 0.45) return;
      setMood("neutral");
      window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    window.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={s.stage}>
      <div className={s.deviceWrap}>
        <div className={s.device}>
          <div className={s.mascotSeat} aria-hidden="true">
            <Mascot mood={mood} size={88} />
          </div>
          <HeroProductDemo lang={lang} alt={alt} />
        </div>
      </div>
    </div>
  );
}
