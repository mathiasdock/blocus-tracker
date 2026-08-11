import test from "node:test";
import assert from "node:assert/strict";
import {
  canAcceptRecoveryEvent,
  canUseEmailChangeSession,
  canUsePasswordRecoverySession,
  parseInitialAuthCallback,
  shouldCaptureAuthCallback,
} from "../lib/authRecovery.mjs";

const recoverySession = { user: { id: "account-a" } };
const NOW = 2_000_000_000;

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(subject, expiresAt) {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: subject, exp: expiresAt })}.signature`;
}

function implicitCallback({ type = "recovery", subject = "account-a", expiresAt = NOW + 3600 } = {}) {
  const hash = new URLSearchParams({
    access_token: fakeJwt(subject, expiresAt),
    refresh_token: "refresh-secret",
    expires_in: "3600",
    expires_at: String(expiresAt),
    token_type: "bearer",
    type,
  });
  return `https://www.blocus-tracker.com/reset-password#${hash}`;
}

test("a recovery session remains valid when the page only receives INITIAL_SESSION", () => {
  const callback = parseInitialAuthCallback(implicitCallback());

  assert.equal(callback.isPasswordRecovery, true);
  assert.equal(callback.hasImplicitTokens, true);
  assert.equal(callback.subject, "account-a");
  assert.equal(Object.values(callback).includes("refresh-secret"), false);
  assert.equal(
    canUsePasswordRecoverySession(callback, recoverySession, "INITIAL_SESSION"),
    true
  );
});

test("opening the reset page while normally signed in cannot change the password", () => {
  const callback = parseInitialAuthCallback(
    "https://www.blocus-tracker.com/reset-password"
  );

  assert.equal(
    canUsePasswordRecoverySession(callback, recoverySession, "INITIAL_SESSION"),
    false
  );
});

test("a crafted type=recovery marker cannot reuse an existing session", () => {
  const callback = parseInitialAuthCallback(
    "https://www.blocus-tracker.com/reset-password#type=recovery",
  );

  assert.equal(callback.hasImplicitTokens, false);
  assert.equal(
    canUsePasswordRecoverySession(callback, recoverySession, "PASSWORD_RECOVERY"),
    false
  );
});

test("a rejected callback can never be reopened by a later INITIAL_SESSION", () => {
  const callback = parseInitialAuthCallback(implicitCallback());

  assert.equal(
    canAcceptRecoveryEvent({
      callback,
      session: recoverySession,
      event: "INITIAL_SESSION",
      initializationSucceeded: false,
      callbackRejected: false,
      nowSeconds: NOW,
    }),
    false
  );
  assert.equal(
    canAcceptRecoveryEvent({
      callback,
      session: recoverySession,
      event: "INITIAL_SESSION",
      initializationSucceeded: true,
      callbackRejected: true,
      nowSeconds: NOW,
    }),
    false
  );
});

test("a callback rejected by server initialization cannot reuse a same-user session", () => {
  const callback = parseInitialAuthCallback(
    implicitCallback({ expiresAt: NOW - 1 })
  );

  assert.equal(
    canAcceptRecoveryEvent({
      callback,
      session: recoverySession,
      event: "INITIAL_SESSION",
      initializationSucceeded: false,
      callbackRejected: true,
    }),
    false
  );
});

test("a recovery callback cannot change a different signed-in account", () => {
  const callback = parseInitialAuthCallback(
    implicitCallback({ subject: "account-b" })
  );

  assert.equal(
    canUsePasswordRecoverySession(callback, recoverySession, "INITIAL_SESSION"),
    false
  );
});

test("an errored callback never reuses an unrelated existing session", () => {
  const callback = parseInitialAuthCallback(
    "https://www.blocus-tracker.com/reset-password#error=access_denied&error_code=otp_expired"
  );

  assert.equal(callback.errorCode, "otp_expired");
  assert.equal(
    canUsePasswordRecoverySession(callback, recoverySession, "INITIAL_SESSION"),
    false
  );
});

test("an old email-change callback is accepted only for its own verified session", () => {
  const callback = parseInitialAuthCallback(
    implicitCallback({ type: "email_change" })
  );

  assert.equal(callback.isEmailChange, true);
  assert.equal(canUseEmailChangeSession(callback, recoverySession), true);
  assert.equal(
    canUsePasswordRecoverySession(callback, recoverySession, "INITIAL_SESSION"),
    false
  );
});

test("new profile email-change callbacks are not retained for later SPA navigation", () => {
  assert.equal(shouldCaptureAuthCallback("/profile"), false);
  assert.equal(shouldCaptureAuthCallback("/reset-password"), true);
  assert.equal(shouldCaptureAuthCallback("/reset-password/"), true);
});
