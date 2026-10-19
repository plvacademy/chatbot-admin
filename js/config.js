/**
 * PLV Chatbot Admin — configuration. This file is public: never put a password, a key or a sheet link here.
 *
 * API_URL  The /exec URL of the chatbot Apps Script web app. Not a secret: every admin action also needs the
 *          password, which the script checks. Leave it empty to type the URL on the login screen instead.
 * CONTACT  Used only by the test chat here (the website has its own config with the same values).
 */
export const CONFIG = Object.freeze({
  API_URL: 'https://script.google.com/macros/s/AKfycbxNHRYpdGLuToqMr0BzxEyQiehUbUJBhTFOeA8VgL7lxXHgknvpsXNIFu0CQAcxssML9w/exec',
  API_PATTERN: /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/,
  REQUEST_TIMEOUT_MS: 30000,

  CONTACT: Object.freeze({
    whatsappNumber: '201556335340',
    socials: Object.freeze({
      facebook: 'https://www.facebook.com/share/1M6PYk11ft/',
      instagram: 'https://instagram.com/_plv25',
      tiktok: 'https://www.tiktok.com/@_plv25',
      youtube: '',
    }),
  }),

  // Website pages the bot's buttons point to (relative to the website, shown as-is in the test chat).
  SITE_LINKS: Object.freeze({
    register: 'programs.html#register',
    coaches: 'coaches.html',
    gallery: 'gallery.html',
    feedback: 'feedback.html',
  }),

  STORAGE: Object.freeze({
    password: 'plv.admin.pw', // sessionStorage: cleared when the tab closes
    apiUrl: 'plv.admin.api', // localStorage: only used while API_URL above is empty
    siteLang: 'plv.admin.lang', // localStorage: language of the test chat
    uiLang: 'plv.admin.ui', // localStorage: language of the panel
  }),

  // Columns of the FAQ tab, in sheet order (must match Chatbot.gs).
  FAQ_COLUMNS: Object.freeze(['id', 'question', 'question_ar', 'keywords', 'answer', 'answer_ar', 'link', 'link_label', 'link_label_ar', 'published', 'order']),
});
