/**
 * Data actions: load from the sheet, edit the draft, save. They update `state` and emit events;
 * they never touch the DOM (components do).
 */
import { CONFIG } from '../config.js?v=3';
import { call } from './api.js?v=3';
import { state, emit, setDirty, clone } from '../state.js?v=3';

const ID_RE = /^[A-Za-z0-9_-]{1,20}$/;
const hasText = (v) => String(v ?? '').trim() !== '';

/* ---------------- load ---------------- */
export async function loadAll({ keepDraft = false } = {}) {
  const data = await call('load');
  state.server = {
    faq: data.faq || [], version: data.version || '', misses: data.misses || [],
    settings: data.settings || {}, areas: data.areas || [], coaches: data.coaches || [],
  };
  if (!keepDraft) {
    state.draft = clone(state.server.faq);
    state.draftSettings = { ...state.server.settings };
    state.fromMiss = new Set();
    state.hiddenMisses = new Set();
    setDirty(false);
  }
  emit('loaded');
}

/* ---------------- FAQ draft ---------------- */
export function nextFaqId() {
  const n = state.draft.reduce((max, r) => Math.max(max, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
  return `F${String(n).padStart(3, '0')}`;
}

export function addFaq(prefill = {}) {
  const row = {
    id: nextFaqId(), question: '', question_ar: '', keywords: '', answer: '', answer_ar: '',
    link: '', link_label: '', link_label_ar: '', published: true, ...prefill,
  };
  state.draft.unshift(row);
  setDirty(true);
  emit('faq', { focus: row.id });
  return row;
}

export function removeFaq(row) {
  state.draft = state.draft.filter((r) => r !== row);
  setDirty(true);
  emit('faq');
}

/** A field was typed in: the bot is rebuilt, the list is not re-rendered (keeps the cursor). */
export function editFaq(row, field, value) {
  row[field] = value;
  setDirty(true);
  emit('faq:edit');
}

export function discardDraft() {
  state.draft = clone(state.server.faq);
  state.fromMiss = new Set();
  state.hiddenMisses = new Set();
  setDirty(false);
  emit('faq');
  emit('misses');
}

/** Rows coming from a CSV / lab file: same id = update, otherwise added. */
export function mergeRows(incoming) {
  let added = 0;
  let updated = 0;
  for (const row of incoming) {
    const existing = row.id && state.draft.find((r) => r.id === row.id);
    if (existing) { Object.assign(existing, row); updated++; } else {
      state.draft.push({ ...row, id: ID_RE.test(row.id || '') ? row.id : nextFaqId() });
      added++;
    }
  }
  setDirty(true);
  emit('faq');
  return { added, updated };
}

/** First problem in the draft as { row, problem: i18n key }, or null. */
export function validateDraft() {
  const ids = new Set();
  for (const r of state.draft) {
    let problem = '';
    if (!hasText(r.answer) && !hasText(r.answer_ar)) problem = 'problem.noAnswer';
    else if (!hasText(r.question) && !hasText(r.question_ar) && !hasText(r.keywords)) problem = 'problem.noQuestion';
    else if (!ID_RE.test(String(r.id))) problem = 'problem.badId';
    else if (ids.has(r.id)) problem = 'problem.dupId';
    ids.add(r.id);
    if (problem) return { row: r, problem };
  }
  return null;
}

/** Saves the draft (order = position in the list). Unanswered questions turned into rows are then removed from the log. */
export async function saveFaq() {
  const rows = state.draft.map((r, i) => ({
    ...Object.fromEntries(CONFIG.FAQ_COLUMNS.map((c) => [c, r[c] ?? ''])),
    published: r.published !== false,
    order: i + 1,
  }));
  const res = await call('saveFaq', { rows, baseVersion: state.server.version });
  state.server.version = res.version;
  state.server.faq = clone(rows);
  state.draft.forEach((r, i) => { r.order = i + 1; });
  if (state.fromMiss.size) {
    const ids = [...state.fromMiss];
    try {
      await call('deleteMisses', { ids });
      state.server.misses = state.server.misses.filter((m) => !state.fromMiss.has(m.id));
    } catch { /* they stay in the log; nothing is lost */ }
    state.fromMiss = new Set();
  }
  setDirty(false);
  emit('faq');
  emit('misses');
  return res.count;
}

/* ---------------- unanswered questions ---------------- */
export function missToFaq(miss) {
  state.hiddenMisses.add(miss.id);
  state.fromMiss.add(miss.id);
  emit('misses');
  return addFaq(/[؀-ۿ]/.test(miss.q) ? { question_ar: miss.q } : { question: miss.q });
}

export async function deleteMiss(id) {
  await call('deleteMisses', { ids: [id] });
  state.server.misses = state.server.misses.filter((m) => m.id !== id);
  emit('misses');
}

export async function clearMisses() {
  await call('clearMisses');
  state.server.misses = [];
  state.fromMiss = new Set();
  emit('misses');
}

/* ---------------- conversation log ---------------- */
export async function loadLog() {
  const res = await call('loadLog', { limit: 3000 });
  state.log = res.log || [];
  state.logTotal = res.total || 0;
  emit('log');
}

export async function clearLog() {
  await call('clearLog');
  state.log = [];
  state.logTotal = 0;
  emit('log');
}

/* ---------------- settings ---------------- */
export function editSetting(key, value) {
  state.draftSettings[key] = String(value || '').trim();
  emit('settings');
}

export async function saveSettings() {
  const res = await call('saveSettings', {
    settings: { botName_ar: state.draftSettings.botName_ar || '', botName_en: state.draftSettings.botName_en || '' },
  });
  state.server.settings = res.settings;
  state.draftSettings = { ...res.settings };
  emit('settings');
}
