/**
 * Registrations made in the test chat. Kept in memory only: nothing is ever sent.
 */
import { $, h, empty, table, formatDate } from '../core/dom.js?v=2';
import { state, on } from '../state.js?v=2';
import { t, locale, getUiLang } from '../i18n.js?v=2';


function render() {
  $('c-reg').textContent = state.regs.length;
  $('reg-list').replaceChildren(state.regs.length
    ? table(['time', 'area', 'name', 'mobile', 'age', 'position'].map((c) => t(`regs.col.${c}`)), state.regs.map(({ at, body }) => {
      const area = state.server.areas.find((a) => a.name === body.area);
      return h('tr', {}, [
        h('td', { class: 'cell-muted', text: formatDate(at, locale(), { timeStyle: 'short' }) }),
        h('td', { text: (getUiLang() === 'ar' && area?.name_ar) || body.area }),
        h('td', { dir: 'auto', text: body.name }),
        h('td', { class: 'ltr', text: body.mobile }),
        h('td', { text: String(body.age) }),
        h('td', { text: t(`pos.${body.position}`) }),
      ]);
    }))
    : empty(t('regs.empty')));
}

export function initRegistrations() {
  on('loaded', render);
  on('regs', render);
  on('ui-lang', render);
}
