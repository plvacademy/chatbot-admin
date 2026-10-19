/**
 * CSV export / import of the FAQ, and import of a backup from the local test screen (JSON).
 * Imported rows are added to the draft; nothing reaches the sheet until "حفظ في الشيت".
 */
import { $ } from '../core/dom.js?v=9';
import { toast } from '../core/ui.js?v=9';
import { toCsv, parseCsv, download, today } from '../core/csv.js?v=9';
import { CONFIG } from '../config.js?v=9';
import { state } from '../state.js?v=9';
import { mergeRows } from '../services/data.js?v=9';
import { t } from '../i18n.js?v=9';

const COLS = CONFIG.FAQ_COLUMNS;

export function exportCsv() {
  const rows = state.draft.map((r, i) => COLS.map((c) => {
    if (c === 'published') return r.published === false ? 'FALSE' : 'TRUE';
    if (c === 'order') return i + 1;
    return r[c];
  }));
  download(`plv-faq-${today()}.csv`, toCsv([COLS, ...rows]), 'text/csv;charset=utf-8');
}

/** Keeps only the known columns, as trimmed text; published is TRUE unless it says FALSE. */
function clean(source) {
  const out = {};
  for (const c of COLS) {
    if (c === 'order') continue;
    out[c] = c === 'published'
      ? source.published !== false && String(source.published ?? '').trim().toLowerCase() !== 'false'
      : String(source[c] ?? '').trim();
  }
  return out;
}
const hasAnswer = (r) => r.answer || r.answer_ar;

function report({ added, updated }) {
  toast(t('files.imported', { added, updated }));
}

async function importFile(file, kind) {
  const text = await file.text();
  if (kind === 'json') {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.faq)) throw new Error('not a lab backup');
    report(mergeRows(data.faq.map(clean).filter(hasAnswer)));
    return;
  }
  const rows = parseCsv(text);
  const head = (rows.shift() || []).map((x) => x.trim().toLowerCase());
  if (!head.includes('answer') && !head.includes('answer_ar')) throw new Error('missing answer columns');
  report(mergeRows(rows.map((r) => clean(Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])))).filter(hasAnswer)));
}

export function initFiles() {
  let kind = 'csv';
  $('export-csv').addEventListener('click', exportCsv);
  $('import-csv').addEventListener('click', () => { kind = 'csv'; $('file').click(); });
  $('import-lab').addEventListener('click', () => { kind = 'json'; $('file').click(); });
  $('file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { await importFile(file, kind); } catch (err) {
      console.error('[PLV:admin import]', err);
      alert(t(kind === 'json' ? 'files.badJson' : 'files.badCsv'));
    }
  });
}
