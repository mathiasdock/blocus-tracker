// Mise en mots d'une mission.
//
// Une mission arrive du serveur sous forme brute : un identifiant, et des
// paramètres gelés au moment de l'attribution — le nom d'un cours, un nombre
// de jours, une cible en minutes. C'est ici qu'elle devient une phrase.
//
// Un seul endroit, parce que la carte du tableau de bord et celle du profil
// affichent les mêmes missions. L'app a déjà payé une fois le prix de deux
// copies qui divergent (trois composants d'icônes recopiés à la main) ; on ne
// recommence pas pour du texte qui, lui, se lit.
//
// ── Ce qui est une durée et ce qui est un compte ────────────
// `target` et `minutes` sont TOUJOURS des minutes et s'affichent en « 1h42 » :
// « Hier : 102 » ne veut rien dire pour personne. `days` et `streak` sont des
// comptes et restent des chiffres nus.

import { formatMinutesShort } from "./format";

// `target` est une durée dans presque toutes les missions… sauf deux. « Étudier
// 5 jours cette semaine » et « 3 cours différents » comptent des jours et des
// cours, et les formater en durée donnait « Étudier 5 min jours cette
// semaine ». D'où le jeu de clés passé par l'appelant plutôt que figé ici.
const TIME_KEYS = new Set(["target", "minutes"]);
const COUNT_ONLY = new Set();

function fill(text, params, timeKeys = TIME_KEYS) {
  if (!text) return "";
  return text.replace(/\{(\w+)\}/g, (whole, key) => {
    const value = params?.[key];
    if (value === undefined || value === null) return whole;
    if (timeKeys.has(key)) return formatMinutesShort(Number(value) * 60);
    return String(value);
  });
}

/**
 * Titre et sous-titre d'une mission.
 *
 * Les missions classiques n'ont qu'un titre. Les défis ont les deux : le titre
 * annonce la situation (« Examen dans 6 jours »), le sous-titre porte la
 * donnée personnelle qui rend le défi crédible (« Travaille Marketing pendant
 * 45 min »). C'est ce second niveau qui fait la différence entre une consigne
 * et un défi adressé à quelqu'un.
 */
export function missionText(t, row) {
  const id = row?.mission_id || row?.id || "";
  const params = row?.params || {};
  const base = row?.key || row?.label_key || `xp.${id}`;

  if (row?.kind !== "challenge") {
    return { title: fill(t(base), params), body: "" };
  }

  // « Examen dans 0 jours » et « dans 1 jours » sont des phrases fausses.
  let titleKey = `${base}.title`;
  if (id === "c_exam_soon") {
    const days = Number(params.days);
    if (days === 0) titleKey = `${base}.today`;
    else if (days === 1) titleKey = `${base}.tomorrow`;
  }

  return {
    title: fill(t(titleKey), params),
    body: fill(t(`${base}.body`), params),
  };
}

/** Libellé d'une mission hebdomadaire : la cible y est une durée ou un compte
 *  selon la mission, d'où le passage par `fill` plutôt qu'un simple t(). */
export function weeklyText(t, row) {
  const id = row?.mission_id || row?.id || "";
  const keys = id === "w_hours" ? TIME_KEYS : COUNT_ONLY;
  return fill(t(row?.key || row?.label_key || `xp.${id}`), { target: row?.target }, keys);
}

/** « 6h24 / 8h », « 3 / 5 jours », « 2 / 3 cours ».
 *
 *  Plafonné à la cible : « 8h30 / 2h » se lit comme une erreur de calcul, pas
 *  comme une réussite. Une fois l'objectif atteint, le surplus n'apprend rien. */
export function weeklyProgressLabel(t, row) {
  const id = row?.mission_id || row?.id || "";
  const target = Number(row?.target || 0);
  const progress = Math.min(Number(row?.progress || 0), target || Infinity);
  if (id === "w_hours") {
    return `${formatMinutesShort(progress * 60)} / ${formatMinutesShort(target * 60)}`;
  }
  const unit = id === "w_days" ? t("xp.weeklyDays") : t("xp.weeklyCourses");
  return `${progress} / ${target} ${unit}`;
}

/** Part accomplie, bornée à 1 — une barre ne dépasse pas son cadre. */
export function weeklyRatio(row) {
  const target = Number(row?.target || 0);
  if (!target) return 0;
  return Math.min(1, Number(row?.progress || 0) / target);
}

/** Ce qu'il reste à faire, en une expression courte : « 32 min », « 2 jours ». */
export function weeklyRemaining(t, row) {
  const id = row?.mission_id || row?.id || "";
  const left = Math.max(0, Number(row?.target || 0) - Number(row?.progress || 0));
  if (id === "w_hours") return formatMinutesShort(left * 60);
  const unit = id === "w_days" ? t("xp.weeklyDays") : t("xp.weeklyCourses");
  return `${left} ${unit}`;
}
