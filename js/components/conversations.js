/**
 * Conversations: every chat on the website, grouped by conversation id, newest first.
 * The log is loaded the first time this tab is opened (and again with "تحديث"), not at login.
 */
import { $, h, empty, formatDate } from '../core/dom.js?v=5';
import { toast, busy } from '../core/ui.js?v=5';
import { state, on } from '../state.js?v=5';
import { loadLog, clearLog } from '../services/data.js?v=5';
import { errorText } from '../services/api.js?v=5';
import { t, locale } from '../i18n.js?v=5';

const PAGE_SIZE = 50;
let shown = PAGE_SIZE;
let activeTab = 'faq';
let loading = false;

/** [{ id, turns: [...oldest first], last, first, missed, pages, langs }] — newest conversation first. */
function group(log) {
  const map = new Map();
  for (const turn of log) {
    if (!map.has(turn.session)) map.set(turn.session, []);
    map.get(turn.session).push(turn);
  }
  return [...map.entries()].map(([id, turns]) => {
    turns.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return {
      id,
      turns,
      first: turns[0].at,
      last: turns[turns.length - 1].at,
      missed: turns.filter((x) => !x.answered).length,
      pages: [...new Set(turns.map((x) => x.page).filter(Boolean))],
      langs: [...new Set(turns.map((x) => x.lang).filter(Boolean))],
    };
  }).sort((a, b) => String(b.last).localeCompare(String(a.last)));
}

function turnNodes(turn) {
  return [
    turn.q ? h('div', { class: 'turn turn--user', dir: 'auto' }, [h('span', { class: 'turn__tag', text: t('log.visitor') }), turn.q]) : null,
    turn.a ? h('div', { class: 'turn turn--bot', dir: 'auto' }, [h('span', { class: 'turn__tag', text: t('log.bot') }), turn.a]) : null,
    h('div', { class: 'turn__intent' }, [
      `${formatDate(turn.at, locale(), { timeStyle: 'short' })} · ${turn.intent || '—'}`,
      turn.answered ? null : h('span', { class: 'pill pill--miss', text: t('log.notAnswered') }),
    ]),
  ];
}

function convoCard(c) {
  const body = h('div', { class: 'convo__body' });
  const card = h('details', { class: `convo${c.missed ? ' has-miss' : ''}`, 'data-session': c.id }, [
    h('summary', {}, [
      h('span', { class: 'convo__when', text: formatDate(c.first, locale()) }),
      h('span', { class: 'convo__meta', text: [
        t('log.turns', { n: c.turns.length }),
        c.langs.map((l) => t(`log.lang.${l}`)).join(' / '),
        c.pages.join(', '),
      ].filter(Boolean).join(' · ') }),
      c.missed ? h('span', { class: 'pill pill--miss', text: t('log.missed', { n: c.missed }) }) : null,
      h('span', { class: 'convo__first', dir: 'auto', text: (c.turns.find((x) => x.q) || c.turns[0]).q || '' }),
    ]),
    body,
  ]);
  // The messages are built only when the conversation is opened (the log can be long).
  card.addEventListener('toggle', () => {
    if (card.open && !body.childElementCount) body.append(...c.turns.flatMap(turnNodes).filter(Boolean));
  });
  return card;
}

function render() {
  const list = $('log-list');
  if (state.log === null) {
    $('c-log').textContent = '…';
    $('log-summary').textContent = '';
    list.replaceChildren(empty(t('log.loading')));
    return;
  }
  const all = group(state.log);
  $('c-log').textContent = all.length;
  const missedTurns = state.log.filter((x) => !x.answered).length;
  $('log-summary').textContent = t('log.summary', { sessions: all.length, turns: state.log.length, missed: missedTurns })
    + (state.logTotal > state.log.length ? t('log.partial', { shown: state.log.length, total: state.logTotal }) : '');
  if (!all.length) { list.replaceChildren(empty(t('log.empty'))); return; }

  const q = $('log-filter').value.trim().toLowerCase();
  const onlyMissed = $('log-only-missed').checked;
  const matches = all.filter((c) => (!onlyMissed || c.missed)
    && (!q || c.turns.some((x) => `${x.q} ${x.a}`.toLowerCase().includes(q))));
  if (!matches.length) { list.replaceChildren(empty(t('log.noMatch'))); return; }
  const cards = matches.slice(0, shown).map(convoCard);
  if (matches.length > shown) {
    cards.push(h('button', { type: 'button', class: 'btn btn--ghost btn--sm convo-more', text: t('log.more'), onclick: () => { shown += PAGE_SIZE; render(); } }));
  }
  list.replaceChildren(...cards);
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    await busy($('refresh-log'), () => loadLog());
  } catch (err) {
    toast(errorText(err));
    if (state.log === null) $('log-list').replaceChildren(empty(errorText(err)));
  } finally {
    loading = false;
  }
}

export function initConversations() {
  $('refresh-log').addEventListener('click', refresh);
  $('clear-log').addEventListener('click', () => {
    if (!confirm(t('log.confirmClear'))) return;
    busy($('clear-log'), () => clearLog().then(() => toast(t('log.cleared')), (err) => toast(errorText(err))));
  });
  $('log-filter').addEventListener('input', () => { shown = PAGE_SIZE; render(); });
  $('log-only-missed').addEventListener('change', () => { shown = PAGE_SIZE; render(); });
  on('tab', (name) => {
    activeTab = name;
    if (name === 'log' && state.log === null) refresh();
  });
  // After login / "تحديث من الشيت": the log is read again the next time (or now, if its tab is open).
  on('loaded', () => {
    state.log = null;
    render();
    if (activeTab === 'log') refresh();
  });
  on('log', render);
  on('ui-lang', render);
}
