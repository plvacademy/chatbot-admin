/**
 * PLV Chatbot Admin — entry point. Wires the components; each one owns its part of the page.
 *
 *   config.js            settings (script URL, contact links)
 *   i18n.js              panel language (Arabic / English)
 *   state.js             shared state + event bus
 *   services/api.js      requests to the Apps Script (password, errors)
 *   services/data.js     load / edit / save actions
 *   bot/engine.js        the chatbot itself (same file as on the website)
 *   bot/texts.js         the bot's sentences (Arabic / English)
 *   bot/runtime.js       the engine built from the current draft
 *   components/*.js      the parts of the page
 */
import { $ } from './core/dom.js?v=10';
import { toast } from './core/ui.js?v=10';
import { CONFIG } from './config.js?v=10';
import { local } from './core/storage.js?v=10';
import { state, emit } from './state.js?v=10';
import { initTabs } from './components/tabs.js?v=10';
import { initChat } from './components/chat.js?v=10';
import { initFaqEditor } from './components/faqEditor.js?v=10';
import { initMisses } from './components/misses.js?v=10';
import { initRegistrations } from './components/registrations.js?v=10';
import { initConversations } from './components/conversations.js?v=10';
import { initBatch } from './components/batch.js?v=10';
import { initSettings } from './components/settings.js?v=10';
import { initFiles } from './components/files.js?v=10';
import { initSaveBar } from './components/saveBar.js?v=10';
import { initAuth } from './components/auth.js?v=10';
import { t, applyStatic, setUiLang } from './i18n.js?v=10';

function initToolbar() {
  const buttons = document.querySelectorAll('[data-site-lang]');
  const mark = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.siteLang === state.siteLang)));
  buttons.forEach((b) => b.addEventListener('click', () => {
    state.siteLang = b.dataset.siteLang;
    local.set(CONFIG.STORAGE.siteLang, state.siteLang);
    mark();
    emit('lang');
  }));
  mark();
  $('debug').addEventListener('change', (e) => toast(t(e.target.checked ? 'debug.on' : 'debug.off')));
  document.querySelectorAll('[data-ui-lang]').forEach((b) => b.addEventListener('click', () => setUiLang(b.dataset.uiLang)));
}

applyStatic();
initTabs();
initToolbar();
initChat();
initFaqEditor();
initMisses();
initRegistrations();
initConversations();
initBatch();
initSettings();
initFiles();
initSaveBar();
initAuth();
