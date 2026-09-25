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
  // La semaine en cours, lundi → dimanche : [{ date, secs, isToday, isFuture }].
  // Les jours à venir restent vides. Dessinés seulement sur ordinateur, où la carte s'étire jusqu'au bas de la
  // colonne du chrono — la place gagnée devient la semaine jour par jour au
  // lieu d'un aplat vide.
  weekDays = [],
  streak,
  streakPaused,
  freezeInfo,
  className = "",
}) {
  const { t, lang } = useI18n();
  const dayTotal = totalToday + Math.max(0, liveSecs);
  const goalPct = goalSecs > 0 ? Math.min(100, Math.round((dayTotal / goalSecs) * 100)) : 0;
  const remaining = Math.max(0, goalSecs - dayTotal);
  const reached = dayTotal >= goalSecs;
  const weekScale = Math.max(goalSecs || 0, ...weekDays.map((d) => d.secs), 1);
  const dayLetter = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "fr-BE", { weekday: "narrow" });
  const dayName = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "fr-BE", { weekday: "long" });
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
            <div className={styles.signals}>
              {freezeInfo?.supported && (
                <span
                  className={`font-num ${styles.signal} ${freezeInfo.stock > 0 ? styles.signalFreeze : styles.signalMuted}`}
                  title={t("streak.freezeStock")}
                >
                  <span className="sr-only">{`${t("streak.stockLabel")} : ${t("streak.stockCount").replace("{n}", String(freezeInfo.stock))}`}</span>
                  <span className={styles.signalVisual} aria-hidden="true">
                    <Glyph size={16} className={styles.signalIcon}>
                      <path d="M12 3 5 6v5.2c0 4.5 2.8 7.6 7 9.8 4.2-2.2 7-5.3 7-9.8V6Z" />
                      <path d="m8.8 11.8 2.1 2.1 4.5-4.8" />
                    </Glyph>
                    <span className={`tabular-nums ${styles.signalValue}`}>{freezeInfo.stock}<span className={styles.signalSuffix}>/2</span></span>
                  </span>
                </span>
              )}
              {freezeInfo?.supported && streak > 0 && <span className={styles.signalDivider} aria-hidden="true" />}
              {streak > 0 && (
                <span
                  className={`font-num ${styles.signal} ${styles.signalStreak}`}
                  title={t("stats.streakLabel")}
                >
                  <span className="sr-only">{t("dash.msgStreak").replace("{n}", String(streak))}</span>
                  <span className={styles.signalVisual} aria-hidden="true">
                    <Flame size={16} variant="outline" animated={false} className={styles.signalIcon} style={{ opacity: streakPaused ? 0.48 : 1 }} />
                    <span className={`tabular-nums ${styles.signalValue}`}><AnimatedNumber value={streak} /><span className={styles.signalSuffix}> {t("stats.dayUnit")}</span></span>
                  </span>
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
          {weekDays.length > 0 && (
            <div className={styles.weekChart} aria-hidden="true">
              {weekDays.map((day, i) => {
                const letter = dayLetter.format(new Date(`${day.date}T12:00:00`));
                return (
                  <div key={day.date} className={styles.weekDay} data-today={day.isToday ? "1" : undefined} data-future={day.isFuture ? "1" : undefined}>
                    <span className={styles.weekBarSlot} style={{ "--top": Math.min(1, day.secs / weekScale) }}>
                      <span className={styles.weekBar} style={{ "--h": drawn ? Math.min(1, day.secs / weekScale) : 0 }} data-empty={day.secs > 0 ? undefined : "1"} />
                      {/* Au survol : le temps de CE jour-là. La barre donne la
                          forme de la semaine, l'infobulle donne le chiffre. */}
                      {!day.isFuture && (
                        <span className={styles.weekTip} data-align={i < 2 ? "start" : i > 4 ? "end" : undefined}>
                          {dayName.format(new Date(`${day.date}T12:00:00`))} · {formatMinutesShort(day.secs)}
                        </span>
                      )}
                    </span>
                    <span className={styles.weekLetter}>{letter}</span>
                  </div>
                );
              })}
            </div>
          )}
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
