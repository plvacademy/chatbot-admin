/**
 * Keeps one chatbot engine built from the current draft (so edits can be tried before saving).
 * engine.js / texts.js are the same files the website uses.
 */
import { createEngine } from './engine.js?v=2';
import { tr } from './texts.js?v=2';
import { CONFIG } from '../config.js?v=2';
import { state, on } from '../state.js?v=2';

let engine = null;
let timer;
let pending = false;

const publishedFaq = () => state.draft.filter((r) => r.published !== false &&
  (String(r.answer || '').trim() || String(r.answer_ar || '').trim()));

function build() {
  engine = createEngine({
    faq: publishedFaq(),
    areas: state.server.areas,
    coaches: state.server.coaches,
    links: {
      ...CONFIG.SITE_LINKS,
      whatsappNumber: CONFIG.CONTACT.whatsappNumber.replace(/\D/g, ''),
      socials: CONFIG.CONTACT.socials,
    },
    botName: { ar: state.draftSettings.botName_ar, en: state.draftSettings.botName_en },
    tr,
  });
}
const rebuildSoon = () => {
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(() => { pending = false; build(); }, 150);
};

on('loaded', build);
on('faq', build);
on('settings', rebuildSoon);
on('faq:edit', rebuildSoon);

/** The current engine (built on first use). */
export function getEngine() {
  if (!engine || pending) { clearTimeout(timer); pending = false; build(); }
  return engine;
}
export { tr };
