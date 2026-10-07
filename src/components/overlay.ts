/** Shared bookkeeping for things that float above the page: sheets, dialogs, menus. */

const layers: symbol[] = [];
const listeners = new Set<() => void>();

export function pushLayer(id: symbol) {
  layers.push(id);
  if (layers.length === 1) lockScroll(true);
  listeners.forEach((l) => l());
}
export function popLayer(id: symbol) {
  const i = layers.lastIndexOf(id);
  if (i >= 0) layers.splice(i, 1);
  if (!layers.length) lockScroll(false);
  listeners.forEach((l) => l());
}
export const isTopLayer = (id: symbol) => layers[layers.length - 1] === id;
export const anyLayerOpen = () => layers.length > 0;
export function subscribeLayers(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

let savedY = 0;
function lockScroll(on: boolean) {
  const b = document.body;
  if (on) {
    savedY = window.scrollY;
    const bar = window.innerWidth - document.documentElement.clientWidth;
    b.style.overflow = 'hidden';
    if (bar > 0) b.style.paddingRight = `${bar}px`;
    b.classList.add('has-layer');
  } else {
    b.style.overflow = '';
    b.style.paddingRight = '';
    b.classList.remove('has-layer');
    if (Math.abs(window.scrollY - savedY) > 1) window.scrollTo(0, savedY);
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.offsetParent !== null);
}

/** Keeps Tab and Shift+Tab inside `root`. Call from a keydown handler. */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, root: HTMLElement) {
  if (e.key !== 'Tab') return;
  const els = focusables(root);
  if (!els.length) return void e.preventDefault();
  const first = els[0];
  const last = els[els.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !root.contains(active))) (e.preventDefault(), last.focus());
  else if (!e.shiftKey && (active === last || !root.contains(active))) (e.preventDefault(), first.focus());
}
