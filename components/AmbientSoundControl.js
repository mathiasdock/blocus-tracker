import { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "../contexts/I18nContext";
import { AMBIENT_PRESETS, isAmbientSupported, startAmbient, stopAmbient, setAmbientVolume } from "../lib/ambientSound";

// Contrôle d'ambiance sonore du mode focus. Volontairement OPT-IN : rien ne
// joue tant que l'utilisateur n'a pas choisi un son (le son ne démarre JAMAIS
// tout seul). On mémorise le dernier son + volume choisis pour le confort, mais
// on repart toujours "éteint" à chaque session. Conçu pour la surface ink
// sombre du mode focus → couleurs en blanc translucide, comme les autres
// contrôles du focus.

const KEY = "bt_ambient_v1"; // { preset, volume } — jamais l'état on/off
const LABEL_KEY = { white: "sound.white", brown: "sound.brown", pink: "sound.pink", rain: "sound.rain", waves: "sound.waves" };

function IconSound({ on }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {on ? (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      ) : (
        <path d="M22 9l-6 6M16 9l6 6" />
      )}
    </svg>
  );
}

export default function AmbientSoundControl({ active, visible = true }) {
  const { t } = useI18n();
  const supported = isAmbientSupported();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  const [preset, setPreset] = useState("brown");
  const [volume, setVolume] = useState(0.5);
  const rootRef = useRef(null);

  // Restaure le dernier son + volume choisis (pas l'état on/off → démarre éteint).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (AMBIENT_PRESETS.includes(s.preset)) setPreset(s.preset);
        if (typeof s.volume === "number") setVolume(s.volume);
      }
    } catch {}
  }, []);

  const persist = useCallback((p, v) => {
    try { localStorage.setItem(KEY, JSON.stringify({ preset: p, volume: v })); } catch {}
  }, []);

  // Pilote le moteur : joue seulement si le mode focus est ouvert ET son activé.
  useEffect(() => {
    if (!supported) return undefined;
    if (active && on) startAmbient(preset, volume);
    else stopAmbient();
    return () => stopAmbient();
    // volume géré à part pour ne pas relancer le son à chaque cran
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, active, on, preset]);

  // Changement de volume sans relancer le son.
  useEffect(() => {
    if (supported && active && on) setAmbientVolume(volume);
  }, [supported, active, on, volume]);

  // Coupe le son si le mode focus se ferme.
  useEffect(() => {
    if (!active) { setOpen(false); setOn(false); }
  }, [active]);

  if (!supported) return null;

  function choose(p) {
    setPreset(p);
    setOn(true);
    persist(p, volume);
  }
  function turnOff() {
    setOn(false);
  }
  function onVolume(v) {
    setVolume(v);
    persist(preset, v);
  }

  const show = visible || open;

  return (
    <div ref={rootRef} className="absolute top-4 left-4 z-20"
      style={{ opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none", transition: "opacity 0.8s ease" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("sound.label")}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold bt-press"
        style={{
          color: on ? "#34D399" : "rgba(255,255,255,0.6)",
          backgroundColor: on ? "rgba(20,184,133,0.18)" : "rgba(255,255,255,0.08)",
          border: `1px solid ${on ? "rgba(20,184,133,0.35)" : "rgba(255,255,255,0.12)"}`,
        }}>
        <IconSound on={on} />
        {on && <span className="tabular-nums">{t(LABEL_KEY[preset])}</span>}
      </button>

      {open && (
        <div className="mt-2 w-60 rounded-2xl p-3"
          style={{ backgroundColor: "rgba(12,26,20,0.92)", border: "1px solid rgba(255,255,255,0.14)", backdropFilter: "blur(8px)", boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}>
          <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>
            {t("sound.label")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={turnOff}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={!on
                ? { backgroundColor: "rgba(255,255,255,0.9)", color: "#0E2A20" }
                : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
              {t("sound.off")}
            </button>
            {AMBIENT_PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => choose(p)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                style={on && preset === p
                  ? { backgroundColor: "#14B885", color: "#fff" }
                  : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                {t(LABEL_KEY[p])}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 px-1">
            <span className="text-[11px] font-medium shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>{t("sound.volume")}</span>
            <input type="range" min="0" max="1" step="0.05" value={volume}
              onChange={(e) => onVolume(parseFloat(e.target.value))}
              aria-label={t("sound.volume")}
              className="w-full"
              style={{ accentColor: "#14B885" }} />
          </div>
        </div>
      )}
    </div>
  );
}
