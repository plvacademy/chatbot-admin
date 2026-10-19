/**
 * Talks to the chatbot Apps Script (Chatbot.gs). Every admin request carries the password; the script checks it.
 *
 * Requests are POST with Content-Type text/plain: a "simple" request, so the browser sends no CORS preflight
 * (Apps Script cannot answer one). The reply is always JSON: { ok:true, ... } or { ok:false, code, message }.
 */
import { CONFIG } from '../config.js?v=8';
import { local } from '../core/storage.js?v=8';
import { emit } from '../state.js?v=8';
import { t } from '../i18n.js?v=8';


export class ApiError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
  /** The message to show the admin, in the panel language. */
  get text() {
    const key = `err.${this.code}`;
    const text = t(key);
    return (text === key ? t('err.network') : text) + (this.detail ? `: ${this.detail}` : '');
  }
}
export const errorText = (err) => (err instanceof ApiError ? err.text : t('err.network'));

const builtIn = CONFIG.API_PATTERN.test(CONFIG.API_URL);
let url = builtIn ? CONFIG.API_URL : (local.get(CONFIG.STORAGE.apiUrl) || '');
let password = '';

export const apiConfig = {
  /** true when the page has no built-in URL and the login screen must ask for it. */
  needsUrl: !builtIn,
  get url() { return url; },
  setUrl(value) {
    if (builtIn) return;
    url = String(value || '').trim();
    if (CONFIG.API_PATTERN.test(url)) local.set(CONFIG.STORAGE.apiUrl, url);
  },
  setPassword(value) { password = String(value || ''); },
  clearPassword() { password = ''; },
};

/** call('load') / call('saveFaq', { rows, baseVersion }) … — resolves with the JSON reply, rejects with ApiError. */
export async function call(op, extra = {}) {
  if (!CONFIG.API_PATTERN.test(url)) throw new ApiError('not_set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'admin', op, password, ...extra }),
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
  let json;
  try { json = JSON.parse(await response.text()); } catch { throw new ApiError('network'); }
  if (json && json.ok === true) return json;
  const err = new ApiError(json?.code || 'network', json?.detail);
  if (err.code === 'unauthorized' || err.code === 'locked') emit('auth:expired', err);
  throw err;
}
