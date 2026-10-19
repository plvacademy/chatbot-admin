/**
 * Bot name (saved separately from the FAQ) and a read-only view of the areas / coaches the bot uses.
 */
import { $, h } from '../core/dom.js?v=9';
import { toast, busy } from '../core/ui.js?v=9';
import { state, on } from '../state.js?v=9';
import { editSetting, saveSettings } from '../services/data.js?v=9';
import { errorText } from '../services/api.js?v=9';
import { t, getUiLang } from '../i18n.js?v=9';

const NAME_INPUTS = { 's-name-ar': 'botName_ar', 's-name-en': 'botName_en' };

function render() {
  for (const [id, key] of Object.entries(NAME_INPUTS)) $(id).value = state.draftSettings[key] || '';
  const li = (text) => h('li', { text });
  const { areas, coaches } = state.server;
  const ar = getUiLang() === 'ar';
  $('areas-ro').replaceChildren(...(areas.length
    ? areas.map((a) => li([ar ? a.name_ar : a.name, ar ? a.name : a.name_ar].filter(Boolean).join(' — ')))
    : [li(t('set.noAreas'))]));
  $('coaches-ro').replaceChildren(...(coaches.length
    ? coaches.map((c) => li([(ar ? c.name_ar : c.name) || c.name || c.name_ar, (ar ? c.role_ar : c.role) || c.role || c.role_ar].filter(Boolean).join(' — ')))
    : [li(t('set.noCoaches'))]));
}

export function initSettings() {
  for (const [id, key] of Object.entries(NAME_INPUTS)) {
    $(id).addEventListener('input', (e) => editSetting(key, e.target.value));
  }
  $('save-settings').addEventListener('click', () => busy($('save-settings'), async () => {
    try { await saveSettings(); render(); toast(t('set.saved')); } catch (err) { toast(errorText(err)); }
  }));
  on('loaded', render);
  on('ui-lang', render);
}
