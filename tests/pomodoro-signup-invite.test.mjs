// Invitation à créer un compte après une vraie session invitée sur /pomodoro :
// le « quand » (lib/pomodoroSignupInvite.mjs). Le parcours sur la vraie page est
// dans tests/pomodoro-page.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  SIGNUP_INVITE_KEY, SIGNUP_INVITE_MIN_SECONDS, qualifiesForSignupInvite, rememberSignupInvite,
  signupInviteAtRest, signupInviteQuiet,
} from "../lib/pomodoroSignupInvite.mjs";
import { STRINGS } from "../lib/i18n.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-11T15:00:00+02:00");
function memoryStorage() {
  const store = new Map();
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}

test("une vraie session : 10 min au moins", () => {
  assert.equal(SIGNUP_INVITE_MIN_SECONDS, 600);
  assert.equal(qualifiesForSignupInvite(599), false);
  assert.equal(qualifiesForSignupInvite(600), true);
  assert.equal(qualifiesForSignupInvite(25 * 60), true);
  assert.equal(qualifiesForSignupInvite(undefined), false);
  assert.equal(qualifiesForSignupInvite(Number.NaN), false);
});

test("au repos seulement : ni travail, ni pause, ni repos Pomodoro, ni Focus", () => {
  const rest = { running: false, elapsed: 0, onBreak: false, focusOpen: false };
  assert.equal(signupInviteAtRest(rest), true);
  assert.equal(signupInviteAtRest({ ...rest, running: true, elapsed: 12 }), false, "travail");
  assert.equal(signupInviteAtRest({ ...rest, elapsed: 300 }), false, "session en pause");
  assert.equal(signupInviteAtRest({ ...rest, running: true, onBreak: true, elapsed: 30 }), false, "repos Pomodoro");
  assert.equal(signupInviteAtRest({ ...rest, onBreak: true }), false, "repos Pomodoro, juste avant de repartir");
  assert.equal(signupInviteAtRest({ ...rest, focusOpen: true }), false, "Focus");
});

test("vue à l'écran sans réponse : rappel possible après 7 jours, puis le repère expiré est effacé", () => {
  const storage = memoryStorage();
  assert.equal(signupInviteQuiet(storage, NOW), false);
  rememberSignupInvite(storage, "seen", NOW);
  assert.deepEqual(JSON.parse(storage.store.get(SIGNUP_INVITE_KEY)), { at: new Date(NOW).toISOString(), reason: "seen" });
  assert.equal(signupInviteQuiet(storage, NOW + DAY), true);
  assert.equal(signupInviteQuiet(storage, NOW + 7 * DAY - 60_000), true);
  assert.equal(signupInviteQuiet(storage, NOW + 7 * DAY), false);
  assert.equal(storage.store.has(SIGNUP_INVITE_KEY), false, "rien ne reste au-delà de la durée annoncée");
});

test("« Continuer sans compte » : 30 jours ; « Créer un compte gratuit » sans compte : 7 jours", () => {
  const storage = memoryStorage();
  rememberSignupInvite(storage, "seen", NOW);
  // Fermée ensuite : la fermeture remplace la simple vue et compte à partir d'elle.
  rememberSignupInvite(storage, "dismissed", NOW + 60_000);
  assert.equal(signupInviteQuiet(storage, NOW + 8 * DAY), true);
  assert.equal(signupInviteQuiet(storage, NOW + 29 * DAY), true);
  assert.equal(signupInviteQuiet(storage, NOW + 30 * DAY + 60_000), false);
  assert.equal(storage.store.has(SIGNUP_INVITE_KEY), false);

  rememberSignupInvite(storage, "signup", NOW);
  assert.equal(signupInviteQuiet(storage, NOW + 6 * DAY), true);
  assert.equal(signupInviteQuiet(storage, NOW + 7 * DAY), false);
});

test("raison inconnue : pas de silence, repère effacé", () => {
  const storage = memoryStorage();
  storage.setItem(SIGNUP_INVITE_KEY, JSON.stringify({ at: new Date(NOW).toISOString(), reason: "toString" }));
  assert.equal(signupInviteQuiet(storage, NOW + DAY), false);
  assert.equal(storage.store.has(SIGNUP_INVITE_KEY), false);
});

test("Dashboard invité : la phrase sous le Chrono ne promet plus de garder la progression", () => {
  assert.equal(STRINGS.fr["guest.timerProgressHint"], "Crée un compte pour enregistrer tes prochaines sessions et suivre ta progression.");
  assert.equal(STRINGS.en["guest.timerProgressHint"], "Create an account to save your next sessions and track your progress.");
});

test("repère illisible ou stockage refusé : pas d'erreur, l'invitation reste possible", () => {
  const storage = memoryStorage();
  storage.setItem(SIGNUP_INVITE_KEY, "{oops");
  assert.equal(signupInviteQuiet(storage, NOW), false);
  assert.equal(storage.store.has(SIGNUP_INVITE_KEY), false);
  storage.setItem(SIGNUP_INVITE_KEY, JSON.stringify({ at: "pas une date" }));
  assert.equal(signupInviteQuiet(storage, NOW), false);
  const refused = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.equal(signupInviteQuiet(refused, NOW), false);
  assert.doesNotThrow(() => rememberSignupInvite(refused, "dismissed", NOW));
  assert.equal(signupInviteQuiet(null, NOW), false);
});
