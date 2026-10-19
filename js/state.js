/**
 * Shared state + a tiny event bus. Components read `state` and re-render on the events they care about:
 *   loaded       data came from the sheet (everything re-renders)
 *   faq          FAQ rows were added / removed / imported (the list re-renders)
 *   faq:edit     a field was typed in (only the bot is rebuilt; the list keeps focus)
 *   misses       the unanswered-questions log changed
 *   settings     the bot name changed
 *   regs         a test registration was added
 *   log          the conversation log was loaded / cleared
 *   tab          a tab was selected (detail = its name)
 *   dirty        unsaved FAQ changes appeared / were saved or discarded
 *   lang         the site language of the test chat changed
 *   auth:expired the password stopped working (wrong / locked): back to the login screen
 */
import { CONFIG } from './config.js?v=6';
import { local } from './core/storage.js?v=6';

export const state = {
  // As last read from / saved to the sheet.
  server: { faq: [], version: '', misses: [], settings: {}, areas: [], coaches: [] },
  // Being edited here (saved with "حفظ في الشيت").
  draft: [],
  draftSettings: {},
  dirty: false,
  // Unanswered questions turned into FAQ rows: removed from the log after the next successful save.
  fromMiss: new Set(),
  hiddenMisses: new Set(),
  // Test-chat registrations (memory only, never sent).
  regs: [],
  // Conversation log (loaded when its tab is opened). null = not loaded yet.
  log: null,
  logTotal: 0,
  siteLang: local.get(CONFIG.STORAGE.siteLang) === 'en' ? 'en' : 'ar',
};

const bus = new EventTarget();
export const on = (name, handler) => bus.addEventListener(name, (e) => handler(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export function setDirty(value) {
  if (state.dirty === value) return;
  state.dirty = value;
  emit('dirty', value);
}

export const clone = (value) => JSON.parse(JSON.stringify(value));
export const visibleMisses = () => state.server.misses.filter((m) => !state.hiddenMisses.has(m.id));
export const savedFaqIds = () => new Set(state.server.faq.map((r) => r.id));

export function botName(lang) {
  const s = state.draftSettings;
  return (lang === 'ar' ? s.botName_ar : s.botName_en) || s.botName_en || s.botName_ar || '';
}
