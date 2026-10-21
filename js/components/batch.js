/**
 * Batch test: many questions at once, to check nothing broke after editing the FAQ.
 */
import { $, h, table } from '../core/dom.js?v=10';
import { state, on } from '../state.js?v=10';
import { getEngine } from '../bot/runtime.js?v=10';
import { t } from '../i18n.js?v=10';

function run() {
  const lines = $('batch-input').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const engine = getEngine();
  let misses = 0;
  const rows = lines.map((q) => {
    const reply = engine.reply(q, state.siteLang);
    if (reply.miss) misses++;
    return h('tr', {}, [
      h('td', { dir: 'auto', text: q }),
      h('td', {}, h('span', { class: `pill${reply.miss ? ' pill--miss' : ''}`, text: !reply.miss ? reply.intent : reply.intent === 'fallback' ? t('batch.miss') : t('batch.needsAnswer', { intent: reply.intent }) })),
      h('td', { class: 'cell-scores', text: (reply.debug || []).slice(0, 3).map((d) => `${d.name} ${d.score}`).join(' · ') }),
    ]);
  });
  $('batch-sum').textContent = t('batch.sum', { ok: lines.length - misses, total: lines.length });
  $('batch-out').replaceChildren(table([t('batch.colQ'), t('batch.colIntent'), t('batch.colScores')], rows));
}

export function initBatch() {
  $('run-batch').addEventListener('click', run);
  on('ui-lang', () => { if ($('batch-out').childElementCount) run(); });
}
