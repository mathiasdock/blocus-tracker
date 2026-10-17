// Local to the mounted Focus screen: no global modal registry or timer state.
const NOTICES = '[aria-labelledby="consent-banner-title"], [data-legal-notice]';
const MODALS = 'dialog[open], [role="dialog"][aria-modal="true"]';
const FOCUSABLE = 'button, input, select, textarea, a[href], summary, [tabindex]';
const tabbable = root => [...root.querySelectorAll(FOCUSABLE)].filter(node =>
  !node.disabled && node.tabIndex >= 0 && node.getClientRects().length &&
  getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert], [aria-hidden="true"]'));

// Existing ordinary overlays use a fixed viewport layer. A panel may be
// nested inside that layer (consent); its own transform/z-index is not the
// layer's priority. Native dialogs always retain the browser's top layer.
function layerOf(node) {
  for (let parent = node; parent && parent !== document.body; parent = parent.parentElement) {
    if (getComputedStyle(parent).position === 'fixed') return parent;
  }
  return node.querySelector('.bt-focus-surface') || node;
}
function above(a, b) {
  const aLayer = layerOf(a), bLayer = layerOf(b);
  const delta = (Number(getComputedStyle(aLayer).zIndex) || 0) - (Number(getComputedStyle(bLayer).zIndex) || 0);
  return delta || (aLayer.compareDocumentPosition(bLayer) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
}

export function isolateFocus(root, initialFocus, onEscape) {
  const opener = document.activeElement;
  const previousModal = root.getAttribute('aria-modal');
  const previousOverflow = document.body.style.overflow;
  const nestedDialogs = new Set();
  const previousInert = new Map();
  const remembered = new Map();
  let active = null, allowed = [], updating = false;

  function restore(node) {
    const value = previousInert.get(node);
    if (value === null) node.removeAttribute('inert');
    else node.setAttribute('inert', value);
    previousInert.delete(node);
  }
  function selectSurface() {
    const native = [...document.querySelectorAll('dialog:modal')];
    // showModal focuses its own topmost dialog before MutationObserver runs.
    const focusedNative = document.activeElement?.closest('dialog:modal');
    if (focusedNative) return focusedNative;
    if (native.length) return native[native.length - 1];
    const ordinary = [...document.querySelectorAll(MODALS)].filter(node =>
      node !== root && !root.contains(node) && node.getClientRects().length &&
      getComputedStyle(node).visibility !== 'hidden' && above(node, root) > 0);
    return ordinary.sort(above).at(-1) || root;
  }
  function releaseRemovedDialogScroll() {
    // InboxSheet can be removed before its ref-based cleanup runs. Recover
    // only a lock left by a native dialog observed inside this Focus. Never
    // replace the lock of a still-open native dialog or a higher overlay.
    const removed = [...nestedDialogs].some(dialog => dialog.open && !dialog.isConnected);
    if (removed && ![...document.querySelectorAll(MODALS)].some(dialog => dialog !== root)) {
      if (document.body.style.overflow === 'hidden') document.body.style.overflow = previousOverflow;
      nestedDialogs.clear();
    }
    for (const dialog of nestedDialogs) if (!dialog.open) nestedDialogs.delete(dialog);
  }
  function sync() {
    if (updating || !root.isConnected) return;
    updating = true;
    const next = selectSurface();
    for (const dialog of root.querySelectorAll('dialog:modal')) nestedDialogs.add(dialog);
    releaseRemovedDialogScroll();
    if (active?.contains(document.activeElement) && document.activeElement.closest(MODALS) === active) remembered.set(active, document.activeElement);
    // Existing nonblocking privacy/legal notices sit above Focus. Keep them
    // usable without forcing a consent choice or promoting them to modals.
    allowed = [next, ...(!next.matches('dialog:modal') ? [...document.querySelectorAll(NOTICES)]
      .filter(node => node.getClientRects().length && above(node, next) > 0) : [])];
    const modalValue = allowed.length > 1 ? 'false' : previousModal;
    if (root.getAttribute('aria-modal') !== modalValue) root.setAttribute('aria-modal', modalValue);
    // Walk each allowed branch; never inert a shared ancestor or another notice.
    const blocked = new Set();
    for (const branch of allowed) for (let node = branch; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children || []) {
        if (sibling !== node && !allowed.some(surface => sibling === surface || sibling.contains(surface)) && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) blocked.add(sibling);
      }
    }
    for (const node of previousInert.keys()) if (!blocked.has(node)) restore(node);
    for (const node of blocked) {
      if (!previousInert.has(node)) previousInert.set(node, node.getAttribute('inert'));
      if (!node.inert) node.inert = true;
    }
    active = next;
    // close() may leave the closed, still-mounted dialog as activeElement
    // until rendering. DOM containment alone must not treat that as focus in
    // the resumed surface; its opener was inert during native/manual restore.
    if (!allowed.some(surface => surface.contains(document.activeElement)) ||
        document.activeElement.closest('dialog:not([open])')) {
      const known = remembered.get(active);
      const target = known?.isConnected && known.getClientRects().length && !known.closest('[inert], dialog:not([open])') ? known
        : active === root ? initialFocus : tabbable(active)[0] || active;
      target?.focus({ preventScroll: true });
    }
    updating = false;
  }
  function onFocus() { sync(); }
  function onKey(event) {
    if (event.defaultPrevented || event.target.ownerDocument !== document) return;
    sync();
    if (!allowed.some(surface => surface.contains(event.target))) return;
    if (event.key === 'Tab' && !active.matches('dialog:modal')) {
      const nodes = allowed.flatMap(tabbable).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const first = nodes[0], last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (event.target === first || !nodes.includes(event.target))) {
        event.preventDefault(); last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (event.target === last || !nodes.includes(event.target))) {
        event.preventDefault(); first.focus({ preventScroll: true });
      }
    }
    // Child panels handle Escape first. Higher overlays keep their own handlers.
    if (event.key === 'Escape' && active === root && root.contains(event.target)) {
      event.preventDefault(); event.stopPropagation(); onEscape();
    }
  }
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });
  document.addEventListener('focusin', onFocus);
  window.addEventListener('keydown', onKey);
  sync();
  return () => {
    observer.disconnect();
    document.removeEventListener('focusin', onFocus);
    window.removeEventListener('keydown', onKey);
    const restoreOpener = root.contains(document.activeElement) || document.activeElement === document.body;
    releaseRemovedDialogScroll();
    for (const node of previousInert.keys()) restore(node);
    if (previousModal === null) root.removeAttribute('aria-modal');
    else root.setAttribute('aria-modal', previousModal);
    if (restoreOpener && opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  };
}
