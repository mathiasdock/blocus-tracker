import { useEffect, useState } from "react";
import AnimatedNumber from "../AnimatedNumber";
import Flame from "../Flame";
import Mascot from "../Mascot";
import { useI18n } from "../../contexts/I18nContext";
import { formatMinutesShort } from "../../lib/format";
import styles from "./StatsHero.module.css";

// Héros des statistiques — « où j'en suis dans ma journée d'étude ».
//
// La carte portait cinq chiffres du même poids dans un rectangle vert : elle
// répondait à « voici quelques statistiques » et pas à la question qu'on se
// pose en ouvrant la page. Trois décisions la recadrent :
//
//   1. Le temps du jour est le seul chiffre dominant, et l'objectif lui est
//      accroché (« 1h24 / 2h ») au lieu de vivre en légende dans un coin.
//   2. La série ne s'affiche plus deux fois. Elle avait une puce en haut ET
//      une case en bas ; elle n'a plus qu'une ligne de second plan, et son
//      vrai domicile reste « Régularité » (record, heatmap, jours gelés).
//   3. La piste de progression devient la ligne de vie de la carte, et la
//      mascotte s'y tient là où en est la journée.
//
// Sur la mascotte : DESIGN.md réserve le personnage aux MOMENTS, pas aux
// états — sauf pour une de ses cinq formes, « compagnon silencieux à côté
// d'un chiffre ». C'est celle-ci : pas de bulle, pas de phrase, pas de clé
// d'événement, aucune fréquence à mémoriser. Elle appartient au dessin de la
// carte, exactement comme le shiba de la carte de niveau du profil.
const HERO_STATES = [
  // Seuils lus du haut vers le bas ; le premier vrai gagne.
  { id: "done", mood: "proud", at: (pct) => pct >= 100 },
  { id: "almost", mood: "happy", at: (pct) => pct >= 80 },
  { id: "halfway", mood: "focused", at: (pct) => pct >= 45 },
  { id: "going", mood: "focused", at: (pct, secs) => secs > 0 },
  { id: "start", mood: "neutral", at: () => true },
];

export default function StatsHero({
  todaySecs,
  goalSecs,
  weekSecs,
  streak,
  className = "",
}) {
  const { t } = useI18n();
  const goalPct = goalSecs > 0 ? Math.min(100, Math.round((todaySecs / goalSecs) * 100)) : 0;
  const remaining = Math.max(0, goalSecs - todaySecs);
  const beyond = Math.max(0, todaySecs - goalSecs);
  const state = HERO_STATES.find((s) => s.at(goalPct, todaySecs));

  // La barre part de zéro et rejoint le jour, en même temps que le chiffre se
  // compte. La page ne rend ce héros qu'une fois les sessions chargées : sans
  // ce premier rendu à 0, la piste apparaîtrait déjà remplie et le geste
  // n'existerait pas. Un timer plutôt qu'une frame d'animation — celles-ci ne
  // s'exécutent pas dans un onglet caché, et la barre resterait vide.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(goalPct);
      return undefined;
    }
    const id = setTimeout(() => setDrawn(goalPct), 60);
    return () => clearTimeout(id);
  }, [goalPct]);

  const goalLabel = formatMinutesShort(goalSecs);
  const message =
    state.id === "done"
      ? (beyond >= 60
        ? t("stats.heroStateBeyond").replace("{time}", formatMinutesShort(beyond))
        : t("stats.heroGoalReached"))
      : state.id === "almost"
        ? t("stats.heroStateAlmost").replace("{time}", formatMinutesShort(remaining))
        : state.id === "halfway"
          ? t("stats.heroStateHalfway").replace("{time}", formatMinutesShort(remaining))
          : state.id === "going"
            ? t("stats.heroRemaining").replace("{time}", formatMinutesShort(remaining))
            : t("stats.heroStateStart");

  return (
    <section className={`${styles.hero} bt-grain ${className}`}>
      <div className={styles.glow} style={{ "--p": `${goalPct}%` }} aria-hidden="true" />

      <div className={styles.body}>
        <h2 className={styles.kicker}>{t("stats.heroTitle")}</h2>

        <div className={styles.figure}>
          <p className={styles.label}>{t("stats.compactToday")}</p>
          <p className={`font-num ${styles.value}`}>
            <AnimatedNumber value={todaySecs} format={formatMinutesShort} />
            <span className={styles.goal}>/ {goalLabel}</span>
          </p>
          <p className={`${styles.message} ${state.id === "done" ? styles.messageDone : ""}`}>
            {message}
          </p>
        </div>

        <div className={styles.runway}>
          {/* Le personnage se tient sur la piste, à l'endroit du jour. Il est
              hors de l'arbre d'accessibilité : la barre juste dessous porte
              déjà la valeur, et un lecteur d'écran n'a pas à entendre deux
              fois la même progression. */}
          <div className={styles.walk} aria-hidden="true">
            <span className={`${styles.finish} ${state.id === "done" ? styles.finishDone : ""}`} />
            <span className={styles.walker} style={{ "--p": `${drawn}%` }}>
              <Mascot mood={state.mood} streak={streak} size={160} />
            </span>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label={t("dash.goal")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={goalPct}
            aria-valuetext={t("stats.heroGoalOf")
              .replace("{done}", formatMinutesShort(todaySecs))
              .replace("{goal}", goalLabel)}
          >
            <div className={styles.fill} style={{ transform: `scaleX(${drawn / 100})` }} />
            <div className={styles.ticks} aria-hidden="true"><i /><i /><i /></div>
          </div>
        </div>

        <div className={styles.meta}>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("stats.compactWeek")}</p>
            <p className={`font-num ${styles.statValue}`}>
              <AnimatedNumber value={weekSecs} format={formatMinutesShort} />
            </p>
          </div>
          <div className={styles.stat}>
            <p className={styles.statLabel}>{t("stats.streakLabel")}</p>
            <p className={`font-num ${styles.statValue}`}>
              <Flame size={14} className={styles.flame} />
              <AnimatedNumber value={streak} suffix={` ${t("stats.dayUnit")}`} />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
