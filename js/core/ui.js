/**
 * Feedback to the admin: a short toast, and a banner for results that need attention (with an optional button).
 */
import { $, h } from './dom.js?v=5';

let toastTimer;
export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2400);
}

/** banner('error' | 'ok', text, { label, onClick }) — banner(null) hides it. */
export function banner(kind, text, action) {
  const wrap = $('banner');
  if (!kind) { wrap.hidden = true; return; }
  const box = wrap.firstElementChild;
  box.className = `banner__box ${kind === 'error' ? 'is-error' : 'is-ok'}`;
  const parts = [h('span', { text })];
  if (action) parts.push(h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: action.label, onclick: action.onClick }));
  box.replaceChildren(...parts);
  wrap.hidden = false;
}

/** Disables a button while an async action runs, optionally with a temporary label. */
export async function busy(button, task, label) {
  const original = button.textContent;
  button.disabled = true;
  if (label) button.textContent = label;
  try { return await task(); } finally {
    button.disabled = false;
    if (label) button.textContent = original;
  }
}
