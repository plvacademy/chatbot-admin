/**
 * Accessible tabs (WAI-ARIA pattern): click, or arrow keys / Home / End when a tab has focus.
 */
import { emit } from '../state.js?v=11';

const tabs = () => [...document.querySelectorAll('[role="tab"]')];

export function selectTab(name, { focus = false } = {}) {
  for (const tab of tabs()) {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    if (panel) panel.hidden = !active;
  }
  emit('tab', name);
}

export function initTabs() {
  for (const tab of tabs()) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', (e) => {
      const list = tabs();
      const i = list.indexOf(tab);
      const rtl = document.documentElement.dir === 'rtl';
      const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
      let next = null;
      if (step) next = list[(i + step + list.length) % list.length];
      if (e.key === 'Home') next = list[0];
      if (e.key === 'End') next = list[list.length - 1];
      if (next) { e.preventDefault(); selectTab(next.dataset.tab, { focus: true }); }
    });
  }
}
