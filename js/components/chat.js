/**
 * Test chat: the real bot on the current draft. It never sends registrations or questions to the sheet:
 * a registration is kept in the "تسجيلات تجريبية" tab instead.
 */
import { $, h } from '../core/dom.js?v=10';
import { CONFIG } from '../config.js?v=10';
import { state, on, emit, botName } from '../state.js?v=10';
import { getEngine, tr } from '../bot/runtime.js?v=10';
import { t } from '../i18n.js?v=10';

const log = () => $('msgs');
const dirOf = (lang) => (lang === 'ar' ? 'rtl' : 'ltr');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let session = {};
let busy = false;

function scroll() { log().scrollTop = log().scrollHeight; }

function typing() {
  const el = h('div', { class: 'typing', 'aria-label': '…' }, [h('i'), h('i'), h('i')]);
  log().append(el);
  scroll();
  return el;
}

function userBubble(text) {
  log().append(h('p', { class: 'msg msg--user', dir: 'auto', text }));
  scroll();
}

function actionLink(action) {
  if (action.type === 'whatsapp') {
    const href = `https://wa.me/${CONFIG.CONTACT.whatsappNumber}${action.text ? `?text=${encodeURIComponent(action.text)}` : ''}`;
    return h('a', { class: 'act act--wa', href, target: '_blank', rel: 'noopener noreferrer', text: action.label });
  }
  return h('a', {
    class: action.external ? 'act act--soft' : 'act', href: action.href, target: '_blank', rel: 'noopener noreferrer',
    text: action.label, title: action.external ? null : t('chat.linkTitle'),
  });
}

function botBubble(reply) {
  const dir = dirOf(reply.lang);
  if (reply.text) log().append(h('p', { class: 'msg msg--bot', dir, text: reply.text }));
  if (reply.actions?.length) log().append(h('div', { class: 'chat__actions', dir }, reply.actions.map(actionLink)));
  if (reply.chips?.length) {
    log().append(h('div', { class: 'chat__chips', dir }, reply.chips.map((chip) =>
      h('button', { type: 'button', class: 'chip', text: chip.label, onclick: () => ask({ chip, lang: reply.lang }) }))));
  }
  if ($('debug').checked && reply.intent) {
    const top = (reply.debug || []).map((d) => `${d.name} ${d.score}`).join(' · ') || '—';
    log().append(h('div', { class: 'dbg' }, [
      'lang ', h('b', { text: reply.lang }), ' → ', h('b', { class: reply.miss ? 'is-miss' : null, text: reply.intent }),
      reply.area ? ` @ ${reply.area}` : '', `  |  ${top}`,
    ]));
  }
  scroll();
}

async function fakeSubmit(reply) {
  const dots = typing();
  await wait(700);
  dots.remove();
  const failed = $('sim-fail').checked;
  if (!failed) {
    state.regs.unshift({ at: new Date().toISOString(), body: reply.submit });
    emit('regs');
  }
  const done = getEngine().submitResult(!failed, reply.lang);
  session.lastIntent = done.intent;
  botBubble(done);
  if ($('debug').checked) {
    log().append(h('div', { class: 'dbg', text: failed ? 'test: simulated failure' : 'test: kept in "تسجيلات تجريبية" only, nothing was sent' }));
    scroll();
  }
}

/** ask({ text }) for typed text, ask({ chip, lang }) for a button. */
export async function ask({ text, chip, lang }) {
  if (busy) return;
  busy = true;
  try {
    userBubble(chip ? chip.label : text);
    const dots = typing();
    await wait(300 + Math.random() * 250);
    dots.remove();
    const engine = getEngine();
    const reply = chip ? engine.replyIntent(chip.intent, lang, session) : engine.reply(text, state.siteLang, session);
    session.lastIntent = reply.intent;
    botBubble(reply);
    if (reply.submit) await fakeSubmit(reply);
  } catch (err) {
    console.error('[PLV:admin chat]', err);
    log().querySelector('.typing')?.remove();
    log().append(h('p', { class: 'msg msg--bot', text: `${t('chat.error')}${err?.message || err}` }));
  } finally {
    busy = false;
    $('input').focus();
  }
}

export function welcome() {
  session = {};
  log().replaceChildren();
  const lang = state.siteLang;
  botBubble({
    lang,
    text: tr(lang, 'bot.welcome', { name: botName(lang) }),
    chips: [
      { intent: 'reg:start', label: tr(lang, 'bot.reg.chatBtn') },
      ...['areas', 'contact', 'about'].map((id) => ({ intent: id, label: tr(lang, `bot.chip.${id}`) })),
    ],
  });
}

function applyLang() {
  const ar = state.siteLang === 'ar';
  $('chat-title').textContent = ar ? 'مساعد PLV' : 'PLV Assistant'; // same header as the website; the name is used in the messages
  $('input').placeholder = ar ? 'اكتب رسالتك…' : 'Type your message…';
  $('send').textContent = ar ? 'إرسال' : 'Send';
  $('reset-chat').textContent = ar ? 'محادثة جديدة' : 'New chat';
  $('form').dir = ar ? 'rtl' : 'ltr';
}

function sendTyped() {
  const text = $('input').value.trim();
  if (!text) return;
  $('input').value = '';
  ask({ text });
}

export function initChat() {
  $('send').addEventListener('click', sendTyped);
  // No <form>: some embedded previews block form submission, so Enter sends directly.
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendTyped(); }
  });
  $('reset-chat').addEventListener('click', welcome);
  on('loaded', () => { applyLang(); welcome(); });
  on('lang', () => { applyLang(); welcome(); });
  on('settings', applyLang);
}
