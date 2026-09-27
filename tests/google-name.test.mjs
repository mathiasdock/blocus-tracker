import test from "node:test";
import assert from "node:assert/strict";
import { googleNamePrefill } from "../lib/googleName.mjs";

const googleUser = (user_metadata, identities = []) => ({
  app_metadata: { provider: "google" },
  user_metadata,
  identities,
});

test("separate Google given and family names take precedence", () => {
  assert.deepEqual(googleNamePrefill(googleUser({
    given_name: "  Marie ",
    family_name: " Dupont ",
    full_name: "Another Display Name",
  }), null), { firstName: "Marie", lastName: "Dupont" });
});

test("the actual Google full_name/name-only shape suggests editable first and last names", () => {
  assert.deepEqual(googleNamePrefill(googleUser({ full_name: "  Mathias   Dock  ", name: "Mathias Dock" }), null), {
    firstName: "Mathias", lastName: "Dock",
  });
  assert.deepEqual(googleNamePrefill(googleUser({ name: "Sam Lee" }), null), {
    firstName: "Sam", lastName: "Lee",
  });
  assert.deepEqual(googleNamePrefill(googleUser({}, [{ provider: "google", identity_data: { full_name: "Alex Kim" } }]), null), {
    firstName: "Alex", lastName: "Kim",
  });
});

test("a missing name leaves both new-profile fields empty", () => {
  assert.deepEqual(googleNamePrefill(googleUser({}), null), { firstName: "", lastName: "" });
  assert.deepEqual(googleNamePrefill(googleUser({ name: "Prince" }), null), { firstName: "Prince", lastName: "" });
});

test("an existing custom profile is never replaced or completed from Google", () => {
  const profile = { first_name: "Chosen", last_name: "Surname" };
  assert.deepEqual(googleNamePrefill(googleUser({ full_name: "Google Display" }), profile), {
    firstName: "Chosen", lastName: "Surname",
  });
  assert.deepEqual(googleNamePrefill(googleUser({ full_name: "Google Display" }), { first_name: "Chosen", last_name: null }), {
    firstName: "Chosen", lastName: "",
  });
});

test("email/password repair does not adopt an unrelated display name", () => {
  assert.deepEqual(googleNamePrefill({ app_metadata: { provider: "email" }, user_metadata: { full_name: "Someone Else" } }, null), {
    firstName: "", lastName: "",
  });
});
