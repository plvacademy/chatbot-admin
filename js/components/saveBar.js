/**
 * The "unsaved changes" bar: save (Ctrl/Cmd + S works too), discard, and warning before leaving the page.
 */
import { $ } from '../core/dom.js?v=2';
import { banner, busy } from '../core/ui.js?v=2';
import { state, on } from '../state.js?v=2';
import { validateDraft, saveFaq, discardDraft } from '../services/data.js?v=2';
import { errorText } from '../services/api.js?v=2';
import { renderFaq, cardFor } from './faqEditor.js?v=2';
import { selectTab } from './tabs.js?v=2';
import { exportCsv } from './files.js?v=2';
import { t } from '../i18n.js?v=2';

async function save() {
  const bad = validateDraft();
  if (bad) {
    $('faq-filter').value = '';
    selectTab('faq');
    renderFaq();
    const card = cardFor(bad.row.id);
    card?.classList.add('is-bad');
    card?.scrollIntoView({ block: 'center' });
    banner('error', t('save.invalid', { id: bad.row.id, problem: t(bad.problem) }));
    return;
  }
  await busy($('save'), async () => {
    try {
      const count = await saveFaq();
      banner('ok', t('save.done', { count }));
    } catch (err) {
      banner('error', errorText(err), err.code === 'conflict'
        ? { label: t('save.downloadMine'), onClick: exportCsv }
        : { label: t('save.retry'), onClick: save });
    }
  }, t('save.saving'));
}

export function initSaveBar() {
  $('save').addEventListener('click', save);
  $('discard').addEventListener('click', () => {
    if (!confirm(t('save.confirmDiscard'))) return;
    discardDraft();
    banner(null);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('app').hidden) {
      e.preventDefault();
      if (state.dirty) save();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  on('dirty', (dirty) => { $('savebar').hidden = !dirty; });
  on('ui-lang', () => banner(null));
}
