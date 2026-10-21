/**
 * Questions visitors asked on the website that the bot could not answer (tab ChatMisses in the sheet).
 */
import { $, h, empty, table, formatDate } from '../core/dom.js?v=10';
import { toast, busy } from '../core/ui.js?v=10';
import { state, on, visibleMisses } from '../state.js?v=10';
import { missToFaq, deleteMiss, clearMisses, loadAll } from '../services/data.js?v=10';
import { errorText } from '../services/api.js?v=10';
import { t, locale } from '../i18n.js?v=10';

const topicLabel = (topic) => { const key = `topic.${topic}`; const v = t(key); return v === key ? topic : v; };


function row(miss) {
  const ignore = h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: t('misses.ignore') });
  ignore.addEventListener('click', () => busy(ignore, () => deleteMiss(miss.id).catch((err) => toast(errorText(err)))));
  return h('tr', {}, [
    h('td', { dir: 'auto' }, [
      miss.q,
      miss.topic ? h('div', { class: 'cell-sub', text: t('misses.topicNote', { topic: topicLabel(miss.topic) }) }) : null,
    ]),
    h('td', { class: 'cell-muted', text: formatDate(miss.at, locale()) }),
    h('td', { class: 'cell-nowrap' }, [
      h('button', { type: 'button', class: 'btn btn--sm', text: t('misses.toFaq'), onclick: () => missToFaq(miss) }), ' ', ignore,
    ]),
  ]);
}

export function renderMisses() {
  const items = visibleMisses();
  $('c-miss').textContent = items.length;
  $('miss-list').replaceChildren(items.length
    ? table([t('misses.colQ'), t('misses.colTime'), ''], items.map(row))
    : empty(t('misses.empty')));
}

export function initMisses() {
  $('refresh-misses').addEventListener('click', () => {
    if (state.dirty) { toast(t('misses.saveFirst')); return; }
    busy($('refresh-misses'), () => loadAll().catch((err) => toast(errorText(err))));
  });
  $('clear-misses').addEventListener('click', () => {
    if (!confirm(t('misses.confirmClear'))) return;
    busy($('clear-misses'), () => clearMisses().then(() => toast(t('misses.cleared')), (err) => toast(errorText(err))));
  });
  on('loaded', renderMisses);
  on('misses', renderMisses);
  on('ui-lang', renderMisses);
}
