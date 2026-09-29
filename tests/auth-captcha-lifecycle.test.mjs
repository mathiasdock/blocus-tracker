import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { act, create } = require("react-test-renderer");
const babel = require("@babel/core");

function mountCaptcha() {
  let lang = "en";
  let dark = false;
  let compact = false;
  let expired = false;
  let resets = 0;
  let controller;
  const themeObservers = new Set();
  const widthObservers = new Set();
  const media = {
    get matches() { return compact; },
    addEventListener(_event, callback) { widthObservers.add(callback); },
    removeEventListener(_event, callback) { widthObservers.delete(callback); },
  };
  const document = {
    documentElement: { classList: { contains: () => dark } },
    addEventListener() {},
    removeEventListener() {},
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() { themeObservers.add(this.callback); }
    disconnect() { themeObservers.delete(this.callback); }
  }
  const Turnstile = React.forwardRef(function FakeTurnstile(props, ref) {
    React.useImperativeHandle(ref, () => ({
      isExpired: () => expired,
      reset: () => { resets += 1; },
    }), []);
    return React.createElement("fake-turnstile", props);
  });

  const source = readFileSync(new URL("../components/auth/AuthCaptcha.js", import.meta.url), "utf8");
  const { code } = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    presets: [[require.resolve("next/dist/compiled/babel/preset-react"), { runtime: "automatic" }]],
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const module = { exports: {} };
  const localRequire = name => {
    if (name === "@marsidev/react-turnstile") return { Turnstile };
    if (name === "../../contexts/I18nContext") return { useI18n: () => ({ lang, t: key => key }) };
    if (name === "../../lib/authCaptcha.mjs") return { AUTH_CAPTCHA_ENABLED: true };
    return require(name);
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: localRequire, document, MutationObserver,
    window: { matchMedia: () => media, setTimeout: () => 1, clearTimeout() {}, location: { reload() {} } },
    process: { env: { NODE_ENV: "test", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-site-key" } },
    console: { warn() {}, error: console.error },
  }, { filename: "AuthCaptcha.js" });
  const { default: AuthCaptcha, useAuthCaptcha } = module.exports;
  function Harness({ tick = 0 }) {
    controller = useAuthCaptcha();
    return React.createElement(AuthCaptcha, { controller, tick });
  }
  let renderer;
  act(() => { renderer = create(React.createElement(Harness)); });
  const widget = () => renderer.root.findByType("fake-turnstile").props;
  return {
    widget,
    get controller() { return controller; },
    get resets() { return resets; },
    retry: () => act(() => renderer.root.findByType("button").props.onClick()),
    requireToken: () => {
      let allowed;
      act(() => { allowed = controller.requireToken(); });
      return allowed;
    },
    rerender: () => act(() => renderer.update(React.createElement(Harness, { tick: 1 }))),
    success: () => act(() => widget().onSuccess("synthetic-token")),
    changeLang: value => act(() => {
      lang = value;
      renderer.update(React.createElement(Harness, { tick: 2 }));
    }),
    changeTheme: value => act(() => {
      dark = value;
      for (const callback of themeObservers) callback();
    }),
    changeWidth: value => act(() => {
      compact = value;
      for (const callback of widthObservers) callback();
    }),
    setExpired: value => { expired = value; },
    unmount: () => act(() => renderer.unmount()),
  };
}

test("Success stays ready across an unrelated parent rerender and stable options", () => {
  const app = mountCaptcha();
  app.success();
  const options = app.widget().options;
  assert.equal(app.controller.state, "ready");
  assert.equal(app.requireToken(), true);
  app.rerender();
  assert.equal(app.controller.state, "ready");
  assert.equal(app.widget().options, options);
  assert.equal(app.resets, 0);
  app.unmount();
});

test("real language, theme and compact-breakpoint changes invalidate the solved token", () => {
  const app = mountCaptcha();
  app.success();
  app.changeLang("fr");
  assert.equal(app.controller.state, "pending");
  assert.equal(app.controller.token, "");
  app.success();
  app.changeTheme(true);
  assert.equal(app.controller.state, "pending");
  app.success();
  app.changeWidth(true);
  assert.equal(app.controller.state, "pending");
  assert.equal(app.widget().options.size, "compact");
  app.success();
  app.rerender();
  assert.equal(app.controller.state, "ready");
  app.unmount();
});

test("a token is accepted once per Auth attempt, then reset; expiry also needs retry", () => {
  const app = mountCaptcha();
  assert.equal(app.requireToken(), false);
  app.success();
  assert.equal(app.requireToken(), true);
  act(() => app.controller.reset());
  assert.equal(app.resets, 1);
  assert.equal(app.requireToken(), false);
  app.success();
  app.setExpired(true);
  assert.equal(app.requireToken(), false);
  assert.equal(app.controller.state, "expired");
  app.unmount();
});

test("Cloudflare errors never auto-retry: one explicit Retry resets the widget", () => {
  const app = mountCaptcha();
  assert.equal(app.widget().options.retry, "never");
  assert.equal(app.widget().options.refreshExpired, "manual");
  assert.equal(app.widget().options.refreshTimeout, "manual");
  let handled;
  act(() => { handled = app.widget().onError("600010"); });
  assert.equal(handled, true);
  assert.equal(app.controller.state, "error");
  assert.equal(app.resets, 0);
  app.retry();
  assert.equal(app.resets, 1);
  assert.equal(app.controller.state, "pending");
  app.unmount();
});

test("an expired success waits for explicit Retry instead of looping", () => {
  const app = mountCaptcha();
  app.success();
  act(() => app.widget().onExpire());
  assert.equal(app.controller.state, "expired");
  assert.equal(app.controller.token, "");
  assert.equal(app.resets, 0);
  app.retry();
  assert.equal(app.resets, 1);
  assert.equal(app.controller.state, "pending");
  app.unmount();
});
