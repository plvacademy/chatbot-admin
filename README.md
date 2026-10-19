# PLV Chatbot Admin

Admin panel for the chatbot of PLV — Performance Lab Volleyball Academy.
The admin edits the bot's questions and answers, reads every conversation visitors had with the bot, reviews
questions the bot could not answer, sets the bot's name, and tries every change in a test chat before saving. The data lives in a private Google Sheet, reached through a
Google Apps Script web app.

لوحة تحكم الشات بوت بتاع PLV: تعديل الأسئلة والإجابات، ومراجعة الأسئلة اللي البوت ماعرفش يرد عليها، واسم البوت، وشات تجربة قبل الحفظ.

## Structure

```
index.html              page markup only
css/
  styles.css            tokens, layout, panels, forms
  chat.css              test chat (same look as the website chat)
  responsive.css        breakpoints
js/
  app.js                entry point: wires the components
  config.js             script URL, contact links, storage keys (public values only)
  state.js              shared state + event bus
  core/                 dom helpers, safe storage, toast / banner, CSV
  services/api.js       requests to the Apps Script (password, errors)
  services/data.js      load / edit / save actions (no DOM)
  bot/engine.js         the chatbot (also used by the website)
  bot/site-bot.js       the module the website imports (data, registration, conversation log)
  bot/texts.js          the bot's sentences, Arabic / English
  bot/runtime.js        the engine built from the current draft
  components/           login, tabs, test chat, FAQ editor, conversations, unanswered questions,
                        test registrations, batch test, settings, files, save bar
assets/favicon.png
```

No build step and no dependencies: plain HTML, CSS and ES modules.
Every CSS / JS reference carries `?v=N`; raise it on all files together after a change so browsers reload them.

## Used by the website

The website loads `js/bot/site-bot.js` (with its `engine.js` and `texts.js`) and only draws the replies:

```js
const { createSiteBot } = await import('https://plvacademy.github.io/chatbot-admin/js/bot/site-bot.js?v=1');
const bot = createSiteBot({ apiUrl, feedbackUrl, whatsappNumber, socials, links, submitRegistration });
await bot.ready;
const reply = await bot.reply(text, lang); // { lang, text, actions, chips, followUp? }
```

So a change to the bot here reaches the website without touching the website's code.

## Run locally

ES modules need a web server (opening the file directly does not work):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Security

- The page holds no secret. The script URL in `js/config.js` is public by design.
- Every admin action sends the password, and the **Apps Script** checks it. After 10 wrong passwords the admin
  actions are locked for 15 minutes.
- The password is kept only for the open tab (sessionStorage) when "remember" is ticked.
- A Content-Security-Policy allows only this site's own files and requests to the Apps Script.
- Text from the sheet is always inserted as text, never as HTML.
- The conversation log never contains phone numbers or the details typed during registration.
- The page asks search engines not to index it.
