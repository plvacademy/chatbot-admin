/**
 * Login / logout. The password is checked by the Apps Script, never by this page.
 * "افتكرني" keeps it in sessionStorage: it is gone when the tab is closed.
 */
import { $ } from '../core/dom.js?v=10';
import { banner } from '../core/ui.js?v=10';
import { CONFIG } from '../config.js?v=10';
import { session } from '../core/storage.js?v=10';
import { state, on, setDirty } from '../state.js?v=10';
import { apiConfig, call, errorText } from '../services/api.js?v=10';
import { loadAll } from '../services/data.js?v=10';
import { t } from '../i18n.js?v=10';

function showApp(visible) {
  $('login').hidden = visible;
  $('app').hidden = !visible;
  $('top-tools').hidden = !visible;
}

export async function reload({ keepDraft = false } = {}) {
  banner(null);
  $('reload').disabled = true;
  try {
    await loadAll({ keepDraft });
  } catch (err) {
    banner('error', errorText(err), { label: t('save.retry'), onClick: () => reload({ keepDraft }) });
  } finally {
    $('reload').disabled = false;
  }
}

async function login(password, remember) {
  apiConfig.setPassword(password);
  $('login-btn').disabled = true;
  $('login-err').textContent = '';
  try {
    await call('login');
    if (remember) session.set(CONFIG.STORAGE.password, password); else session.remove(CONFIG.STORAGE.password);
    showApp(true);
    await reload();
  } catch (err) {
    apiConfig.clearPassword();
    if (err.code === 'unauthorized' || err.code === 'locked') session.remove(CONFIG.STORAGE.password);
    $('login-err').textContent = errorText(err);
    $('pw').focus();
  } finally {
    $('login-btn').disabled = false;
  }
}

export function logout(message = '') {
  apiConfig.clearPassword();
  session.remove(CONFIG.STORAGE.password);
  setDirty(false);
  showApp(false);
  $('pw').value = '';
  $('login-err').textContent = message;
  $('pw').focus();
}

export function initAuth() {
  if (apiConfig.needsUrl) {
    $('api-wrap').hidden = false;
    $('api-url').value = apiConfig.url;
  }
  $('login-btn').addEventListener('click', () => {
    if (apiConfig.needsUrl) apiConfig.setUrl($('api-url').value);
    const password = $('pw').value;
    if (password) login(password, $('remember').checked);
  });
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('login-btn').click(); } });
  $('logout').addEventListener('click', () => {
    if (state.dirty && !confirm(t('auth.confirmLogout'))) return;
    logout();
  });
  $('reload').addEventListener('click', () => {
    if (state.dirty && !confirm(t('auth.confirmReload'))) return;
    reload();
  });
  // The password stopped working (changed in the script, or locked after wrong attempts).
  on('auth:expired', (err) => { if (!$('app').hidden) logout(errorText(err)); });

  // Page reloaded with a remembered password: open the panel straight away. Loading the data checks the
  // password anyway (a wrong one logs out through 'auth:expired'); a network error keeps the password and
  // shows "retry", so a slow or failed request never sends the admin back to the login screen.
  const remembered = session.get(CONFIG.STORAGE.password);
  if (remembered) {
    apiConfig.setPassword(remembered);
    showApp(true);
    reload();
  } else {
    $('pw').focus();
  }
}
