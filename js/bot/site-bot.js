/**
 * PLV chatbot for the website. The website imports this one module and only draws what it returns.
 *
 *   const { createSiteBot } = await import(CONFIG.CHATBOT_MODULE_URL);
 *   const bot = createSiteBot({ apiUrl, feedbackUrl, whatsappNumber, socials, links, submitRegistration });
 *   await bot.ready;                 // loads FAQ / bot name / areas / coaches (+ reviews); never rejects
 *   bot.welcome(lang)                // -> Reply
 *   await bot.reply(text, lang)      // -> Reply      (visitor typed something)
 *   await bot.choose(chip, lang)     // -> Reply      (visitor pressed one of reply.chips)
 *   bot.botName(lang)                // always '': the chat header keeps the website's own title ("PLV Assistant");
 *                                    // the bot's name is only used inside its messages
 *   bot.reset()                      // new conversation
 *
 * Reply = {
 *   lang: 'ar' | 'en',
 *   text: string,                                   // plain text (may contain \n): show with textContent
 *   actions: [{ label, href, external, kind: 'whatsapp' | 'link' }],
 *   chips: [{ id, label }],
 *   followUp?: Promise<Reply>,                      // after a confirmed registration: the result
 * }
 *
 * The module sends chat registrations through the website's own submitRegistration(data, meta), and logs every
 * turn of the conversation to the chatbot Apps Script (tab ChatLog; unanswered questions also go to ChatMisses).
 * One conversation = one id, kept for the browser tab (sessionStorage) across pages, renewed after 30 minutes
 * without messages or by reset(). Phone numbers and the name / phone typed during registration are never logged.
 * Nothing here needs a secret.
 */
import { createEngine } from './engine.js?v=3';
import { tr } from './texts.js?v=3';

const TIMEOUT_MS = 10000;
const START_CHIPS = ['areas', 'contact', 'about'];
const SESSION_KEY = 'plv.chat.session';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const PRIVATE_STEPS = ['name', 'mobile', 'age']; // registration answers that are personal data
const PLACEHOLDER = { ar: '(بيانات تسجيل)', en: '(registration details)' };

const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** The conversation id: the same for the whole visit in this tab (also across pages), new after 30 idle minutes. */
let memorySession = null; // used when sessionStorage is not available
function conversationId(fresh = false) {
  let s = null;
  try { s = JSON.parse(globalThis.sessionStorage?.getItem(SESSION_KEY) || 'null'); } catch { s = memorySession; }
  if (!s) s = memorySession;
  const now = Date.now();
  if (fresh || !s || !s.id || now - s.at > SESSION_IDLE_MS) s = { id: newId() };
  s.at = now;
  memorySession = s;
  try { globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* memory only */ }
  return s.id;
}

const currentPage = () => {
  try { return (globalThis.location?.pathname || '').split('/').pop() || 'index.html'; } catch { return ''; }
};

async function getJson(url, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

const withParam = (url, param) => `${url}${url.includes('?') ? '&' : '?'}${param}`;
const isHttps = (u) => typeof u === 'string' && /^https:\/\//.test(u);

/** Visitors sometimes type a phone number or similar: never store long digit runs in the log. */
const scrub = (text) => String(text).replace(/[+\d][\d\s\-().]{6,}\d/g, '•••').slice(0, 300);

/** Average rating and count of the published reviews (null when there are none / they could not be read). */
function summarize(items) {
  const ratings = (Array.isArray(items) ? items : []).map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
  if (!ratings.length) return null;
  return { count: ratings.length, average: ratings.reduce((a, b) => a + b, 0) / ratings.length };
}

export function createSiteBot(options = {}) {
  const {
    apiUrl = '', feedbackUrl = '', whatsappNumber = '', socials = {}, links = {}, submitRegistration = null,
  } = options;
  const waNumber = String(whatsappNumber).replace(/\D/g, '');

  let data = { faq: [], areas: [], coaches: [], settings: {}, reviews: null };
  let engine = build();
  let session = {};

  function build() {
    return createEngine({
      faq: data.faq,
      areas: data.areas,
      coaches: data.coaches,
      reviews: data.reviews,
      links: { ...links, whatsappNumber: waNumber, socials },
      botName: { ar: data.settings.botName_ar, en: data.settings.botName_en },
      tr,
    });
  }

  /* -------- data from the sheet (and reviews); the bot still works with its built-in answers if this fails -------- */
  const ready = (async () => {
    const [chat, feedback] = await Promise.allSettled([
      isHttps(apiUrl) ? getJson(withParam(apiUrl, 'type=chat')) : Promise.reject(new Error('no apiUrl')),
      isHttps(feedbackUrl) ? getJson(withParam(feedbackUrl, 'type=feedback')) : Promise.reject(new Error('no feedbackUrl')),
    ]);
    if (chat.status === 'fulfilled' && chat.value && chat.value.ok) {
      const v = chat.value;
      data = { ...data, faq: v.faq || [], areas: v.areas || [], coaches: v.coaches || [], settings: v.settings || {} };
    } else if (chat.status === 'rejected') {
      console.warn('[PLV:chatbot] using built-in answers only:', chat.reason?.message || chat.reason);
    }
    if (feedback.status === 'fulfilled' && feedback.value) data.reviews = summarize(feedback.value.items);
    engine = build();
  })().catch((err) => { console.warn('[PLV:chatbot]', err); });

  /* -------- engine reply -> website Reply -------- */
  function toReply(r) {
    const lang = r.lang === 'en' ? 'en' : 'ar';
    const actions = (r.actions || []).map((a) => {
      if (a.type === 'whatsapp') {
        return {
          kind: 'whatsapp', external: true, label: a.label,
          href: `https://wa.me/${waNumber}${a.text ? `?text=${encodeURIComponent(a.text)}` : ''}`,
        };
      }
      return { kind: 'link', external: !!a.external, label: a.label, href: a.href };
    }).filter((a) => a.href && (a.kind !== 'whatsapp' || waNumber));
    const chips = (r.chips || []).map((c) => ({ id: c.intent, label: c.label }));
    const out = { lang, text: r.text || '', actions, chips };
    if (r.submit) out.followUp = sendRegistration(r.submit, lang);
    return out;
  }

  async function sendRegistration(body, lang) {
    if (typeof submitRegistration !== 'function') {
      return toReply(engine.submitResult(false, lang));
    }
    try {
      await submitRegistration(
        { area: body.area, name: body.name, mobile: body.mobile, age: body.age, position: body.position },
        { requestId: body.requestId, elapsedMs: body.elapsedMs, lang: body.lang || lang, honeypot: '' },
      );
      const done = engine.submitResult(true, lang);
      session.lastIntent = done.intent;
      logTurn('', done);
      return toReply(done);
    } catch (err) {
      console.warn('[PLV:chatbot] registration failed:', err?.kind || '', err?.code || err?.message || err);
      const failed = engine.submitResult(false, lang, err?.code);
      logTurn('', failed);
      return toReply(failed);
    }
  }

  /**
   * One turn -> the conversation log (and, when unanswered, the admin's "Unanswered" list).
   * Fire and forget: a failure is only reported in the console.
   */
  function logTurn(question, r, hide = []) {
    if (!isHttps(apiUrl)) return;
    let answer = String(r.text || '');
    for (const value of hide) if (value) answer = answer.split(String(value)).join('•••');
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request: no CORS preflight
      body: JSON.stringify({
        action: 'log', session: conversationId(), page: currentPage(), lang: r.lang,
        q: scrub(question), a: scrub(answer).slice(0, 500), intent: String(r.intent || '').slice(0, 60),
        answered: !r.miss, miss: !!r.miss, website: '',
      }),
      credentials: 'omit',
      keepalive: true,
    }).catch((err) => console.warn('[PLV:chatbot] could not log the conversation:', err?.message || err));
  }

  /** Personal registration data typed so far (masked in the logged answers). */
  const regSecrets = () => [session.reg?.data?.name, session.reg?.data?.mobile].filter(Boolean);

  function botName(lang = 'ar') {
    const s = data.settings || {};
    return String((lang === 'en' ? s.botName_en : s.botName_ar) || s.botName_en || s.botName_ar || '').trim();
  }

  return {
    ready,
    // The owner wants the header to stay "PLV Assistant": the name (from the sheet) appears only in the messages.
    botName: () => '',

    welcome(lang = 'ar') {
      session = {};
      const l = lang === 'en' ? 'en' : 'ar';
      return toReply({
        lang: l,
        text: tr(l, 'bot.welcome', { name: botName(l) }),
        chips: [{ intent: 'reg:start', label: tr(l, 'bot.reg.chatBtn') }, ...START_CHIPS.map((id) => ({ intent: id, label: tr(l, `bot.chip.${id}`) }))],
      });
    },

    async reply(text, lang = 'ar') {
      const message = String(text || '').slice(0, 500);
      const privateStep = !!session.reg && PRIVATE_STEPS.includes(session.reg.step);
      const regLang = session.reg?.lang || lang;
      const before = regSecrets();
      const r = engine.reply(message, lang, session);
      session.lastIntent = r.intent;
      logTurn(privateStep ? PLACEHOLDER[regLang] || PLACEHOLDER.ar : message, r, [...before, ...regSecrets(), privateStep ? message : '']);
      return toReply(r);
    },

    async choose(chip, lang = 'ar') {
      const id = typeof chip === 'string' ? chip : chip?.id;
      const label = typeof chip === 'string' ? chip : (chip?.label || chip?.id || '');
      const before = regSecrets();
      const r = engine.replyIntent(String(id || 'menu'), lang, session);
      session.lastIntent = r.intent;
      logTurn(label, r, [...before, ...regSecrets()]);
      return toReply(r);
    },

    /** New conversation: clears the bot's memory and starts a new conversation id. */
    reset() { session = {}; conversationId(true); },

    /** The current conversation id (for support / debugging). */
    conversationId: () => conversationId(),
  };
}
