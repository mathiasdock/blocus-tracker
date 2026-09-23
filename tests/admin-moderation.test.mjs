import test from "node:test";
import assert from "node:assert/strict";
import {
  MODERATION_ACTIONS,
  REASON_MAX,
  classifyAdminDbError,
  deletionConfirmed,
  httpStatusForAdminError,
  isModerationAction,
  isUuid,
  validateReason,
} from "../lib/adminModeration.mjs";

test("a reason is required, trimmed and bounded", () => {
  assert.deepEqual(validateReason("  spam   répété  "), { ok: true, reason: "spam répété" });
  assert.deepEqual(validateReason("ok"), { ok: false, error: "reason_required" });
  assert.deepEqual(validateReason("   "), { ok: false, error: "reason_required" });
  assert.deepEqual(validateReason(undefined), { ok: false, error: "reason_required" });
  assert.deepEqual(validateReason(42), { ok: false, error: "reason_required" });
  assert.deepEqual(validateReason("x".repeat(REASON_MAX + 1)), { ok: false, error: "reason_too_long" });
  assert.equal(validateReason("x".repeat(REASON_MAX)).ok, true);
});

test("only the three targeted moderation actions exist", () => {
  assert.deepEqual([...MODERATION_ACTIONS], ["reset_username", "clear_bio", "remove_avatar"]);
  assert.equal(isModerationAction("clear_bio"), true);
  // Free profile editing and admin promotion are not moderation actions.
  assert.equal(isModerationAction("edit_profile"), false);
  assert.equal(isModerationAction("set_admin"), false);
  assert.equal(isModerationAction(undefined), false);
});

test("deleting an account needs the member's username retyped", () => {
  assert.equal(deletionConfirmed("AliceDupont", "AliceDupont"), true);
  assert.equal(deletionConfirmed("  @alicedupont ", "AliceDupont"), true);
  assert.equal(deletionConfirmed("Alice", "AliceDupont"), false);
  assert.equal(deletionConfirmed("", "AliceDupont"), false);
  // A profile without a username can never be confirmed by an empty field.
  assert.equal(deletionConfirmed("", ""), false);
  assert.equal(deletionConfirmed("", null), false);
});

test("member ids must be UUIDs before any query runs", () => {
  assert.equal(isUuid("7f3c2a1e-9b4d-4c2a-8e1f-0a1b2c3d4e5f"), true);
  assert.equal(isUuid("7f3c2a1e-9b4d-4c2a-8e1f-0a1b2c3d4e5"), false);
  assert.equal(isUuid("../admin"), false);
  assert.equal(isUuid(null), false);
});

test("database refusals become stable codes and HTTP statuses", () => {
  const cases = [
    [{ code: "42501", message: "You cannot suspend yourself" }, "self_target", 403],
    [{ code: "42501", message: "You cannot delete your own account here" }, "self_target", 403],
    [{ code: "42501", message: "Admins cannot be suspended" }, "admin_target", 403],
    [{ code: "42501", message: "Admins cannot be moderated here" }, "admin_target", 403],
    [{ code: "22023", message: "Unknown profile" }, "not_found", 404],
    [{ code: "22023", message: "Unknown account" }, "not_found", 404],
    [{ code: "22023", message: "A reason is required" }, "reason_required", 400],
    [{ code: "42501", message: "Admin only" }, "forbidden", 403],
    [{ code: "22023", message: "Unknown moderation action" }, "invalid", 400],
    [{ code: "XX000", message: "boom" }, "failed", 500],
  ];
  for (const [error, code, status] of cases) {
    assert.equal(classifyAdminDbError(error), code, error.message);
    assert.equal(httpStatusForAdminError(code), status, code);
  }
  assert.equal(httpStatusForAdminError("confirmation_mismatch"), 400);
  assert.equal(httpStatusForAdminError("files_failed"), 500);
});
