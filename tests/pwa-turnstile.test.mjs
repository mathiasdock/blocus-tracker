import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("the PWA leaves Turnstile outside its cross-origin cache", () => {
  const source = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
  const otherRule = { options: { cacheName: "static-js-assets" }, handler: "StaleWhileRevalidate" };
  const crossOriginRule = {
    options: { cacheName: "cross-origin" },
    handler: "NetworkFirst",
    urlPattern: ({ sameOrigin }) => !sameOrigin,
  };
  const nextPwa = {
    default: (options) => (config) => ({ ...config, workboxOptions: options.workboxOptions }),
    runtimeCaching: [otherRule, crossOriginRule],
  };
  const context = {
    module: { exports: {} },
    require: (name) => {
      assert.equal(name, "@ducanh2912/next-pwa");
      return nextPwa;
    },
    process: { env: { NODE_ENV: "production" } },
  };
  vm.runInNewContext(source, context, { filename: "next.config.js" });

  const rules = context.module.exports.workboxOptions.runtimeCaching;
  assert.equal(rules[2], otherRule);
  const matches = rules.find((rule) => rule.options?.cacheName === "cross-origin").urlPattern;
  assert.equal(matches({ sameOrigin: false, url: new URL("https://challenges.cloudflare.com/turnstile/v0/api.js") }), false);
  assert.equal(matches({ sameOrigin: false, url: new URL("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/widget") }), false);
  assert.equal(matches({ sameOrigin: false, url: new URL("https://cdn.onesignal.com/sdk.js") }), true);
  assert.equal(matches({ sameOrigin: true, url: new URL("https://www.blocus-tracker.com/login") }), false);
});
