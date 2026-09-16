// Le système d'unités de temps étudié — une seule échelle pour le Chrono, le
// mode Focus et la progression du jour.
//
// POURQUOI CE FICHIER EXISTE. Les trois vues dessinaient la même quantité avec
// trois règles différentes : le chrono plafonnait à 12 blocs puis écrivait
// « +N », le focus à 16, et la carte du jour fabriquait une case par quart
// d'heure d'objectif. Pire, un objectif atteint remplissait TOUTES les cases :
// 25 min d'objectif = deux blocs pleins de quinze minutes, soit trente minutes
// annoncées pour vingt-cinq réellement étudiées. Les blocs racontaient
// l'objectif, pas le travail.
//
// LA RÈGLE. Une unité représente une DURÉE, jamais un état d'objectif. Sa
// surface remplie est la fraction réellement mesurée. Une unité entamée reste
// entamée même si l'objectif est atteint. Le texte exact (le chrono lui-même)
// reste la valeur de référence ; ce module ne change que le rendu.
//
// DESIGN.md § Study Blocks : « Data unit ≠ visual unit », quinze minutes est
// l'unité conceptuelle, la compression change le rendu et jamais la donnée
// stockée ni l'éligibilité aux récompenses.

export const QUARTER_SECS = 900;

// L'échelle monte quand les quarts d'heure deviendraient illisibles. Le second
// nombre est le plafond de lisibilité PROPRE à ce palier : huit quarts d'heure
// (deux heures) se comptent encore d'un regard, vingt-quatre non. Une journée
// de six heures doit donner six groupes d'une heure, pas vingt-quatre lattes.
const SCALE_STEPS = [
  [QUARTER_SECS, 8],
  [3600, 12],
  [7200, 12],
];

function clamp01(value) {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

/**
 * Décrit une quantité de temps étudié en unités affichables.
 *
 * @param {number} earnedSecs   Temps réellement étudié (secondes).
 * @param {number|null} plannedSecs  Objectif explicite, ou rien. Pas d'objectif
 *   = pas de capacité inventée : on ne dessine que ce qui a été gagné.
 * @param {number} maxUnits     Combien d'unités la largeur disponible supporte.
 * @returns {{
 *   unitSecs: number, units: {capacity: number, fill: number}[],
 *   goalIndex: number, goalAt: number|null,
 *   earnedSecs: number, plannedSecs: number,
 *   remainingSecs: number, overSecs: number,
 *   activeIndex: number,
 * }}
 */
export function studyBlockLayout({ earnedSecs = 0, plannedSecs = null, maxUnits = 12 } = {}) {
  const earned = Math.max(0, Math.floor(earnedSecs || 0));
  const planned = plannedSecs > 0 ? Math.floor(plannedSecs) : 0;
  const span = Math.max(earned, planned);
  const budget = Math.max(1, Math.floor(maxUnits));

  let unitSecs = SCALE_STEPS[SCALE_STEPS.length - 1][0];
  for (const [secs, readable] of SCALE_STEPS) {
    if (Math.ceil(span / secs) <= Math.min(readable, budget)) {
      unitSecs = secs;
      break;
    }
  }
  // Jamais de « +N » : plutôt que de masquer du temps derrière un compteur, on
  // agrandit l'unité jusqu'à ce que tout tienne. Le libellé d'unité suit.
  while (Math.ceil(span / unitSecs) > budget) unitSecs *= 2;

  const count = Math.ceil(span / unitSecs);
  const units = [];
  for (let i = 0; i < count; i++) {
    const start = i * unitSecs;
    units.push({
      // Part de cette unité couverte par l'objectif. Sans objectif, l'unité
      // entière est le cadre du quart d'heure en cours — pas une promesse.
      capacity: planned ? clamp01((planned - start) / unitSecs) : 1,
      fill: clamp01((earned - start) / unitSecs),
    });
  }

  // La frontière exacte de l'objectif quand elle tombe AU MILIEU d'une unité :
  // c'est elle qui empêche 25 min de ressembler à 30.
  const rawGoalIndex = planned ? Math.floor(planned / unitSecs) : -1;
  const goalAt = planned && planned % unitSecs !== 0 ? (planned % unitSecs) / unitSecs : null;
  const goalIndex = goalAt !== null && rawGoalIndex < count ? rawGoalIndex : -1;

  return {
    unitSecs,
    units,
    goalIndex,
    goalAt: goalIndex >= 0 ? goalAt : null,
    earnedSecs: earned,
    plannedSecs: planned,
    remainingSecs: planned ? Math.max(0, planned - earned) : 0,
    overSecs: planned ? Math.max(0, earned - planned) : 0,
    // L'unité où en est le curseur : celle qui respire pendant le travail et
    // qui porte l'anneau d'arrêt en pause.
    activeIndex: count ? Math.min(count - 1, Math.floor(earned / unitSecs)) : -1,
  };
}

// Première unité située AU-DELÀ de l'objectif : elle ouvre le temps bonus, et
// c'est l'écart devant elle qui distingue « prévu » de « en plus ».
export function firstOverIndex(layout) {
  if (!layout.plannedSecs) return -1;
  const index = layout.units.findIndex((unit) => unit.capacity === 0);
  return index;
}
