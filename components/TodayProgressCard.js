import { useEffect, useState } from "react";
import AnimatedNumber from "./AnimatedNumber";
import Glyph from "./Glyph";
import Flame from "./Flame";
import { useI18n } from "../contexts/I18nContext";
import { formatMinutesShort } from "../lib/format";
import { studyBlockLayout, firstOverIndex } from "../lib/studyBlocks.mjs";
import styles from "./TodayProgressCard.module.css";

// Progression du jour — la même journée que le héros de /stats, vue depuis le
// chrono. La carte comptait QUATRE fois la même quantité : le grand chiffre, le
// pourcentage d'objectif, la barre d'objectif, puis « 3/8 blocs » et sa
// deuxième barre. Les huit blocs de quinze minutes valent exactement les deux
// heures de l'objectif — c'était le même nombre, rendu de quatre façons
// empilées.
//
// Il n'en reste qu'un objet : la piste de blocs EST l'objectif. Elle vient du
// brief de cette page, qui promettait de « rendre l'effort concret par unités
// de 15 minutes regroupées visuellement par heure » — ce que la barre continue
// ne faisait pas. C'est aussi ce qui distingue cette carte du héros de /stats :
// même famille, mais là-bas une piste continue sur toute la largeur d'une page,
// ici des quarts d'heure qui se remplissent dans un rail.
//
// Pas de mascotte ici, contrairement à /stats : le tableau de bord lui donne
// déjà des MOMENTS — fin de session, missions — et un personnage permanent en
// plus ferait deux shibas à l'écran au même instant.
export default function TodayProgressCard({
  // Temps ENREGISTRÉ du jour (sessions en base + celles qui viennent d'être
  // arrêtées et attendent leur aller-retour).
  totalToday,
  // Temps de la session EN COURS, pas encore enregistré. La carte lisait
  // seulement `totalToday` : pendant qu'un chrono affichait 16:19, elle
  // pouvait afficher « 1 min ». Exact, incompréhensible. Elle additionne
  // maintenant les deux et nomme la part en cours ; à l'enregistrement,
  // `liveSecs` retombe à zéro au moment exact où `totalToday` monte, donc rien
  // n'est compté deux fois.
  liveSecs = 0,
  // L'objectif du jour vient du dashboard, il n'est plus redéclaré ici. Les
  // blocs s'en déduisent : si l'objectif bouge un jour, la piste suit au lieu
  // de mentir.
  goalSecs,
  weekSecs,
  // Cible hebdomadaire, venue de la mission w_hours. Cette carte affichait
  // déjà « cette semaine : 8h31 » et la carte des missions affichait, trois
  // cents pixels plus haut, « Étudier 2h cette semaine — 8h30 / 2h » : le même
  // chiffre, deux fois, dans la même colonne. La mission ne s'écrit plus
  // ailleurs — elle devient l'objectif de la stat qui existait déjà.
  weeklyGoalMin = 0,
  streak,
  streakPaused,
  freezeInfo,
  className = "",
}) {
  const { t } = useI18n();
  const dayTotal = totalToday + Math.max(0, liveSecs);
  const goalPct = goalSecs > 0 ? Math.min(100, Math.round((dayTotal / goalSecs) * 100)) : 0;
  const remaining = Math.max(0, goalSecs - dayTotal);
  const reached = dayTotal >= goalSecs;
  const weekPct = weeklyGoalMin > 0
    ? Math.min(100, Math.round((weekSecs / (weeklyGoalMin * 60)) * 100))
    : 0;

  // Même système d'échelle que le Chrono et le mode Focus (lib/studyBlocks.mjs).
  // La carte fabriquait une case par quart d'heure d'objectif : à trois heures
  // d'étude, douze cases toutes pleines et rien pour le dépassement.
  const layout = studyBlockLayout({
    earnedSecs: dayTotal, plannedSecs: goalSecs, maxUnits: 12,
  });
  const overIndex = firstOverIndex(layout);
  const quarterScale = layout.unitSecs === 900;
  const unitLabel = formatMinutesShort(layout.unitSecs);

  // Les blocs partent vides et se remplissent en cascade au montage, comme la
  // piste de /stats. Un minuteur plutôt qu'une frame d'animation : celles-ci ne
  // s'exécutent pas dans un onglet caché, et la piste y resterait vide.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return undefined;
    }
    const id = setTimeout(() => setDrawn(true), 60);
    return () => clearTimeout(id);
  }, []);

  const goalLabel = formatMinutesShort(goalSecs);

  return (
    <section className={`card-ink bt-grain min-w-0 ${styles.card} ${className}`}>
      <div className={styles.glow} style={{ "--p": `${goalPct}%` }} aria-hidden="true" />

      <div className={styles.body}>
        <div className={styles.head}>
          <h2 className={`bt-dashboard-title-accent ${styles.title}`}>{t("dash.todayProgress")}</h2>

          {(streak > 0 || freezeInfo?.supported) && (
            <div className={styles.chips}>
              {freezeInfo?.supported && (
                <span
                  className={`font-num ${styles.chip} ${freezeInfo.stock > 0 ? styles.chipFreeze : styles.chipFreezeEmpty}`}
                  title={t("streak.freezeStock")}
                  aria-label={`${t("streak.stockLabel")} : ${t("streak.stockCount").replace("{n}", String(freezeInfo.stock))}`}
                >
                  <Glyph size={12}>
                    <path d="M12 2v20M4 6l16 12M20 6 4 18M12 2 9.5 4.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5" />
                  </Glyph>
                  <span className="tabular-nums">{freezeInfo.stock}/2</span>
                </span>
              )}
              {streak > 0 && (
                <span className={`font-num ${styles.chip} ${styles.chipStreak}`}>
                  <Flame size={12} style={{ color: streakPaused ? "rgba(251,191,36,0.48)" : "#FBBF24" }} />
                  <span className="tabular-nums"><AnimatedNumber value={streak} /></span>
                </span>
              )}
            </div>
          )}
        </div>

        <p className={`font-num ${styles.value}`}>
          <AnimatedNumber value={dayTotal} format={formatMinutesShort} />
          <span className={styles.goal}>/ {goalLabel}</span>
        </p>

        <div
          className={styles.blocks}
          role="progressbar"
          aria-label={t("dash.goal")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goalPct}
          // Même phrase que sur /stats : la clé y est déjà, une seconde
          // formulation du même fait ne servirait personne.
          aria-valuetext={t("stats.heroGoalOf")
            .replace("{done}", formatMinutesShort(dayTotal))
            .replace("{goal}", goalLabel)}
        >
          {layout.units.map((unit, i) => (
            <span
              key={i}
              className={styles.cell}
              // Respiration d'une heure toutes les quatre unités — seulement
              // quand l'unité est le quart d'heure ; au-delà elle EST l'heure.
              data-cluster={quarterScale && i > 0 && i % 4 === 0 ? "1" : undefined}
              // L'écart marque l'endroit où l'objectif s'arrête et où le temps
              // en plus commence. Ce temps-là reste visible, il ne disparaît pas
              // dans une piste plafonnée à 100 %.
              data-over={i === overIndex ? "1" : undefined}
              data-plain={unit.capacity === 0 ? "1" : undefined}
              // `--n` = nombre d'unités (largeur du dégradé), `--d` = nombre
              // d'intervalles (position de la tranche). Les deux changent avec
              // l'échelle, et `--d` ne descend jamais à zéro.
              style={{ "--c": unit.capacity, "--n": layout.units.length, "--d": Math.max(1, layout.units.length - 1) }}
            >
              <span className={styles.cellFill} style={{ "--i": i, "--f": drawn ? unit.fill : 0 }} />
              {i === layout.goalIndex && (
                <span className={styles.cellGoal} style={{ "--g": layout.goalAt }} aria-hidden="true" />
              )}
            </span>
          ))}
        </div>

        <div className={`font-num ${styles.trackLabels}`}>
          {/* L'unité est écrite en permanence : elle CHANGE selon la journée,
              et une piste compressée sans légende serait ambiguë. La part en
              cours s'y ajoute pendant qu'une session tourne — c'est la seule
              chose que le grand chiffre ne dit pas. */}
          <span className={styles.lead}>
            {t("dash.blockUnitLabel").replace("{u}", unitLabel)}
            {liveSecs > 0 && ` · ${t("dash.todayLive").replace("{t}", formatMinutesShort(liveSecs))}`}
          </span>
          <span className={reached ? styles.done : undefined}>
            {reached ? t("dash.goalDone") : t("dash.goalLeft").replace("{time}", formatMinutesShort(remaining))}
          </span>
        </div>

        <div className={styles.week}>
          <div className={styles.weekHead}>
            <span className={styles.weekLabel}>{t("dash.recWeek")}</span>
            <span className={`font-num ${styles.weekValue}`}>
              <AnimatedNumber value={weekSecs} format={formatMinutesShort} />
              {/* Le grand chiffre reste le TEMPS REELLEMENT ETUDIE. Le plafonner
                  à la cible — « 2h / 2h » quand on en a fait huit — remplaçait un
                  fait par un score et faisait disparaître le travail réel. La
                  barre porte l'objectif, le chiffre porte la vérité. */}
              {weeklyGoalMin > 0 && (
                <span className={styles.weekGoal}> / {formatMinutesShort(weeklyGoalMin * 60)}</span>
              )}
            </span>
          </div>
          {weeklyGoalMin > 0 && (
            <div
              className={styles.weekTrack}
              role="progressbar"
              aria-label={t("dash.recWeek")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={weekPct}
            >
              <div className={styles.weekFill} style={{ transform: `scaleX(${drawn ? weekPct / 100 : 0})` }} />
            </div>
          )}
        </div>

        {streakPaused && <p className={styles.paused}>{t("blocus.paused")}</p>}
      </div>
    </section>
  );
}
