/**
 * Small DOM helpers. Everything is built with textContent / attributes (never innerHTML), so text from the sheet
 * or from visitors can never be interpreted as HTML.
 */
export const $ = (id) => document.getElementById(id);

/**
 * h('button', { class: 'btn', text: 'Save', onclick: fn }, [children])
 * - `text` sets textContent; `on<event>` adds a listener; false / null attributes are skipped.
 */
export function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child != null && child !== false && child !== '') node.append(child);
  return node;
}

/** A table inside a horizontally scrollable wrapper. */
export function table(headers, rows) {
  return h('div', { class: 'tablewrap' }, h('table', {}, [
    h('thead', {}, h('tr', {}, headers.map((t) => h('th', { text: t })))),
    h('tbody', {}, rows),
  ]));
}

export const empty = (text) => h('div', { class: 'empty', text });

export function formatDate(iso, locale, options = { dateStyle: 'short', timeStyle: 'short' }) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, options);
}
