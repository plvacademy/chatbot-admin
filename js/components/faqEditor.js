/**
 * FAQ editor: one card per question. Typing updates the draft (and the test bot) without re-rendering,
 * so the cursor never jumps.
 */
import { $, h, empty } from '../core/dom.js?v=5';
import { state, on, savedFaqIds } from '../state.js?v=5';
import { addFaq, removeFaq, editFaq } from '../services/data.js?v=5';
import { selectTab } from './tabs.js?v=5';
import { ask } from './chat.js?v=5';
import { t } from '../i18n.js?v=5';

// Each field keeps the direction of its content (Arabic fields stay right-to-left in the English panel too).
function field(label, row, key, { multiline = false, ltr = false, rtl = false, auto = false, full = false, placeholder = '' } = {}) {
  const input = h(multiline ? 'textarea' : 'input', { class: ltr ? 'ltr' : null, dir: ltr ? 'ltr' : rtl ? 'rtl' : auto ? 'auto' : null, placeholder });
  input.value = row[key] ?? '';
  input.addEventListener('input', () => editFaq(row, key, input.value));
  return h('label', { class: full ? 'field full' : 'field' }, [label, input]);
}

function card(row, saved) {
  const published = h('input', { type: 'checkbox' });
  published.checked = row.published !== false;
  const el = h('div', { class: `card${row.published === false ? ' is-off' : ''}`, 'data-id': row.id }, [
    h('div', { class: 'card__top' }, [
      h('span', {}, [h('span', { class: 'card__id', text: row.id }), saved.has(row.id) ? null : h('span', { class: 'card__new', text: t('faq.new') })]),
      h('div', { class: 'card__actions' }, [
        h('label', { class: 'switch switch--sm' }, [published, t('faq.published')]),
        h('button', {
          type: 'button', class: 'btn btn--ghost btn--sm', text: t('faq.try'),
          onclick: () => {
            const text = row.question_ar || row.question || String(row.keywords || '').split(/[,،]/)[0];
            if (text) ask({ text });
          },
        }),
        h('button', {
          type: 'button', class: 'btn btn--danger btn--sm', text: t('faq.delete'),
          onclick: () => { if (confirm(t('faq.confirmDelete', { id: row.id }))) removeFaq(row); },
        }),
      ]),
    ]),
    h('div', { class: 'grid' }, [
      field(t('faq.qAr'), row, 'question_ar', { rtl: true, placeholder: 'السن المسموح كام؟' }),
      field(t('faq.qEn'), row, 'question', { ltr: true, placeholder: 'What ages do you accept?' }),
      field(t('faq.keywords'), row, 'keywords', { full: true, auto: true, placeholder: 'سن, عمر, سنين, age, ages, 3omr' }),
      field(t('faq.aAr'), row, 'answer_ar', { multiline: true, rtl: true }),
      field(t('faq.aEn'), row, 'answer', { multiline: true, ltr: true }),
      field(t('faq.link'), row, 'link', { ltr: true, full: true, placeholder: 'programs.html#register  /  https://…' }),
      field(t('faq.labelAr'), row, 'link_label_ar', { rtl: true, placeholder: 'سجّل دلوقتي' }),
      field(t('faq.labelEn'), row, 'link_label', { ltr: true, placeholder: 'Register now' }),
    ]),
  ]);
  published.addEventListener('change', () => {
    editFaq(row, 'published', published.checked);
    el.classList.toggle('is-off', !published.checked);
  });
  return el;
}

export function cardFor(id) {
  return $('faq-list').querySelector(`[data-id="${CSS.escape(id)}"]`);
}

export function renderFaq({ focus } = {}) {
  const list = $('faq-list');
  $('c-faq').textContent = state.draft.length;
  if (!state.draft.length) {
    list.replaceChildren(empty(t('faq.empty')));
    return;
  }
  const q = $('faq-filter').value.trim().toLowerCase();
  const saved = savedFaqIds();
  list.replaceChildren(...state.draft.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q)).map((r) => card(r, saved)));
  if (focus) {
    const target = cardFor(focus);
    target?.scrollIntoView({ block: 'nearest' });
    target?.querySelector('textarea, input:not([type=checkbox])')?.focus();
  }
}

export function initFaqEditor() {
  $('add-faq').addEventListener('click', () => addFaq());
  $('faq-filter').addEventListener('input', () => renderFaq());
  on('loaded', () => renderFaq());
  on('ui-lang', () => renderFaq());
  on('faq', (detail) => {
    if (detail?.focus) { $('faq-filter').value = ''; selectTab('faq'); }
    renderFaq(detail || {});
  });
}
