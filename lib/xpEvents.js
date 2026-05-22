export function notifyXPChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("bt-xp-changed"));
}
