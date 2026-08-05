// ── Récapitulatif de fin de session ────────────────────────────────────────
//
// Remplace le toast vert coin-bas-droite qui vivait en dur dans `dashboard.js`.
//
// CE N'EST PAS UNE MODALE, ET C'EST DÉLIBÉRÉ. `components/Celebration.js` est
// la modale centrée à confettis, réservée aux moments RARES (level-up, paliers
// de série 7/30/100). Une session se termine plusieurs fois par jour : en faire
// une seconde modale banaliserait la vraie et obligerait à fermer un voile à
// chaque fois. Ici, l'écran reste utilisable : feuille en bas sur mobile, carte
// en bas à droite sur desktop.
//
// UNE SEULE SURFACE, DEUX ÉTATS. « Envoyer à un ami » ne pousse pas un calque
// de plus : la carte bascule sur place vers la liste d'amis, puis revient. On
// ne perd jamais le contexte du moment qu'on est en train de fêter.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../contexts/I18nContext";
import { formatMinutesShort, displayName } from "../lib/format";
import AnimatedNumber from "./AnimatedNumber";
import Mascot from "./Mascot";
import { Avatar } from "./Layout";
import { playSensoryCue } from "../lib/sensoryFeedback";

// Durée avant fermeture automatique. Le compte à rebours se FIGE dès que la
// carte est survolée, touchée ou reçoit le focus clavier : avec un bouton
// d'action dedans, une carte qui s'évapore pendant qu'on la vise est hostile.
const AUTO_CLOSE_MS = 10000;

function IconCheck({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconSend({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  );
}

function IconBack({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function SessionCompleteCard({
  data,            // { durationSecs, goalPct, xpGained, courseName, courseColor, note }
  streak = 0,
  onClose,
  friends,         // null tant que non chargé ; [] = pas encore d'amis
  onLoadFriends,
  onShare,         // async (friendId) => boolean
  canShare = true, // false pour un invité : pas de compte, pas d'amis
}) {
  const { t } = useI18n();
  const [view, setView]       = useState("recap"); // "recap" | "friends"
  const [sentTo, setSentTo]   = useState(null);
  const [sending, setSending] = useState(null);
  const [held, setHeld]       = useState(false);   // survol / focus / doigt
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (data) playSensoryCue("complete");
  }, [data]);

  // Fermeture automatique — suspendue tant que la carte est tenue, ou dès qu'on
  // est passé sur la liste d'amis (choisir quelqu'un prend plus de 10 s).
  useEffect(() => {
    if (held || view === "friends") return undefined;
    const id = setTimeout(() => closeRef.current?.(), AUTO_CLOSE_MS);
    return () => clearTimeout(id);
  }, [held, view]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (view === "friends") setView("recap");
      else closeRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const openFriends = useCallback(() => {
    setView("friends");
    onLoadFriends?.();
  }, [onLoadFriends]);

  async function share(friend) {
    if (sending) return;
    setSending(friend.id);
    const ok = await onShare?.(friend);
    setSending(null);
    if (ok) {
      playSensoryCue("share");
      setSentTo(friend);
      setView("recap");
    }
  }

  const goalPct = Math.max(0, Math.min(100, data?.goalPct || 0));

  // La barre part de 0 puis se remplit : sans ce premier rendu à 0, la
  // transition CSS n'a rien à interpoler et la barre apparaît déjà pleine.
  const [barPct, setBarPct] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarPct(goalPct));
    return () => cancelAnimationFrame(id);
  }, [goalPct]);

  const sortedFriends = useMemo(() => {
    if (!friends) return null;
    return [...friends].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }));
  }, [friends]);

  if (!data) return null;

  const hold   = { onMouseEnter: () => setHeld(true), onMouseLeave: () => setHeld(false),
                   onFocus: () => setHeld(true), onBlur: () => setHeld(false),
                   onTouchStart: () => setHeld(true) };

  return (
    // Positionnement : la nav mobile fait 56 px + la zone sûre de l'indicateur
    // home, et elle disparaît à `lg` (pas à `sm`). La carte se pose AU-DESSUS
    // d'elle pour qu'on puisse toujours changer de page pendant qu'elle est là.
    <div
      className="bt-session-done fixed z-[9000] inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)]
                 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[380px]"
      role="status" aria-live="polite" {...hold}>
      <div className="card-ink bt-grain overflow-hidden" style={{ borderRadius: 22 }}>
        <div className="relative z-10 p-4 sm:p-5">

          {/* ── En-tête : mascotte + cours + fermer ── */}
          <div className="flex items-start gap-3">
            <div className="bt-session-pop shrink-0" style={{ marginTop: -2 }}>
              <Mascot streak={streak} size={52} ariaLabel={t("coach.timer.done")} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5" style={{ color: "var(--bt-ink-text)" }}>
                <span className="bt-session-check inline-flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 18, height: 18, backgroundColor: "var(--bt-accent)", color: "#04231A" }}>
                  <IconCheck size={11} />
                </span>
                <span className="font-semibold text-sm truncate">{t("dash.doneTitle")}</span>
              </div>
              {data.courseName && (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs truncate" style={{ color: "var(--bt-ink-muted)" }}>
                  {data.courseColor && (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: data.courseColor }} />
                  )}
                  <span className="truncate">{data.courseName}</span>
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label={t("coach.close")} title={t("coach.close")}
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-lg leading-none"
              style={{ color: "var(--bt-ink-muted)" }}>
              ×
            </button>
          </div>

          {view === "recap" ? (
            <>
              {/* ── Les deux chiffres, en compteur ── */}
              <div className="bt-session-stagger mt-4 flex items-end gap-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
                    style={{ color: "var(--bt-ink-muted)" }}>{t("dash.doneDuration")}</p>
                  <AnimatedNumber
                    value={data.durationSecs} duration={900} format={formatMinutesShort}
                    className="font-bold leading-none"
                    style={{ fontSize: 30, color: "var(--bt-ink-text)", letterSpacing: "-0.03em" }} />
                </div>
                {data.xpGained > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
                      style={{ color: "var(--bt-ink-muted)" }}>{t("dash.doneXP")}</p>
                    <AnimatedNumber
                      value={data.xpGained} duration={900} prefix="+"
                      className="font-bold leading-none"
                      style={{ fontSize: 30, color: "var(--bt-accent)", letterSpacing: "-0.03em" }} />
                  </div>
                )}
              </div>

              {/* ── Objectif du jour ── */}
              {goalPct > 0 && (
                <div className="bt-session-stagger mt-4">
                  <div className="flex items-center justify-between text-[11px] mb-1.5"
                    style={{ color: "var(--bt-ink-muted)" }}>
                    <span>{t("dash.doneGoalPct")}</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--bt-ink-text)" }}>{goalPct} %</span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden"
                    style={{ height: 6, backgroundColor: "rgba(255,255,255,0.14)" }}>
                    <div className="bt-session-bar h-full rounded-full"
                      style={{ width: `${barPct}%`, backgroundImage: "linear-gradient(90deg, #14B885, #2BD9A4)" }} />
                  </div>
                </div>
              )}

              {/* ── Envoi ── */}
              {canShare && (
                <div className="bt-session-stagger mt-4">
                  {sentTo ? (
                    <p className="flex items-center gap-2 text-xs font-semibold"
                      style={{ color: "var(--bt-accent)" }}>
                      <IconCheck size={13} />
                      {t("share.sessionSent").replace("{name}", displayName(sentTo))}
                    </p>
                  ) : (
                    <button type="button" onClick={openFriends}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold"
                      style={{ backgroundColor: "rgba(255,255,255,0.10)", color: "var(--bt-ink-text)",
                               border: "1px solid var(--bt-ink-border)" }}>
                      <IconSend size={14} />
                      {t("share.sessionCta")}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* ── Choix de l'ami, sur la MÊME surface ── */}
              <div className="mt-4 flex items-center gap-2">
                <button type="button" onClick={() => setView("recap")} aria-label={t("common.back")}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ color: "var(--bt-ink-muted)", border: "1px solid var(--bt-ink-border)" }}>
                  <IconBack size={13} />
                </button>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--bt-ink-muted)" }}>
                  {t("share.pickFriend")}
                </p>
              </div>

              <div className="mt-3 max-h-[210px] overflow-y-auto -mx-1 px-1">
                {sortedFriends === null && (
                  <p className="py-4 text-center text-xs" style={{ color: "var(--bt-ink-muted)" }}>
                    {t("common.loading")}
                  </p>
                )}
                {sortedFriends?.length === 0 && (
                  <p className="py-4 text-center text-xs leading-relaxed" style={{ color: "var(--bt-ink-muted)" }}>
                    {t("share.noFriends")}
                  </p>
                )}
                <ul className="space-y-1">
                  {sortedFriends?.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => share(f)} disabled={!!sending}
                        className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors"
                        style={{ backgroundColor: sending === f.id ? "rgba(255,255,255,0.12)" : "transparent",
                                 opacity: sending && sending !== f.id ? 0.45 : 1 }}>
                        <Avatar url={f.avatar_url} pseudo={f.pseudo} size={30} />
                        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--bt-ink-text)" }}>
                          {displayName(f)}
                        </span>
                        <span className="shrink-0" style={{ color: "var(--bt-ink-muted)" }}>
                          {sending === f.id ? <span className="text-xs">…</span> : <IconSend size={13} />}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
