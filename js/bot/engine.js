/**
 * PLV — the academy's own chatbot "brain". No AI service, no API key, nothing leaves the browser.
 *
 * How it answers:
 *   1. The visitor's message is normalised (Arabic letter variants, diacritics, Arabic digits, repeated letters,
 *      "ال"/"و"/"بال" prefixes, common suffixes) so "المدربين", "مدربين" and "مدرب" look alike.
 *   2. It is compared with
 *        - the owner's FAQ rows from the "FAQ" sheet tab (question, question_ar, keywords) — these always win a tie;
 *        - a few built-in topics (register, areas, coaches, contact, prices/schedule, gallery, reviews, about…),
 *          whose answers use the live sheet data (published areas and coaches) and never invent details.
 *   3. Small typos are forgiven (one or two letters, depending on word length). Egyptian "Franco" (3ayez, fen, bekam…) works too.
 *   4. Nothing good enough → an honest "I'm not sure" with a WhatsApp button that carries the visitor's question.
 *
 * This module has no DOM code, so it can be tested on its own (see the test notes in README).
 */

/* ------------------------------------------------------------------ */
/* Text normalisation                                                  */
/* ------------------------------------------------------------------ */
const ARABIC_RE = /[؀-ۿ]/;
const DIACRITICS_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // harakat, Quranic marks, tatweel

export function normalize(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(DIACRITICS_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})\1{2,}/gu, '$1') // "اهلاااا" -> "اهلا", "hiii" -> "hi"
    .trim();
}

const AR_PREFIXES = ['وبال', 'وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'وب', 'ول', 'وف'];
const AR_SUFFIXES = ['ين', 'ون', 'ات', 'هم', 'كم', 'كو', 'نا', 'ها', 'ه', 'ي', 'ك'];

/** All the forms a word may be compared under: the word, without its prefix, without its suffix. */
function variants(token) {
  const out = new Set([token]);
  if (ARABIC_RE.test(token)) {
    let base = token;
    for (const p of AR_PREFIXES) {
      if (base.startsWith(p) && base.length - p.length >= 2) { base = base.slice(p.length); break; }
    }
    if (base.length >= 4 && base.startsWith('و')) out.add(base.slice(1));
    out.add(base);
    for (const s of AR_SUFFIXES) {
      // one-letter endings (سنه -> سن) may leave a two-letter root; longer ones need three letters left
      if (base.endsWith(s) && base.length - s.length >= (s.length === 1 ? 2 : 3)) { out.add(base.slice(0, -s.length)); break; }
    }
  } else {
    if (token.length > 4 && token.endsWith('es')) out.add(token.slice(0, -2));
    if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) out.add(token.slice(0, -1));
    if (token.length > 5 && token.endsWith('ing')) out.add(token.slice(0, -3));
  }
  return [...out];
}

const STOPWORDS = new Set(normalize(`
  في من على عن الى إلى الي لـ ان إن أن انا أنا انت إنت انتو انتم احنا هو هي هم ده دي دا دول ذلك هذا هذه
  هل ما ماذا ايه إيه اي أي ازاي إزاي لو يا مع او أو و ف ب ل ك كل بس كده كدا ممكن عايز عاوز عايزه عاوزه محتاج
  حابب اعرف أعرف تعرف عندكم عندك عندي فيه في لي ليا لينا بتاع بتاعت بتوع حضرتك لحضرتك سؤال استفسار
  the a an is are am be to of for in on at by and or with do does did you your we our i me my it this that
  can could would will please about what which who how there have has any some want need know tell
  3ayez 3awez 3ayz 3awz 3ayza momken ana enta ento homa eh ay law ya fe fi
`).split(/\s+/).filter(Boolean));

export function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = same word (any form), 0.8 = a small typo away, 0 = different. */
function wordMatch(msgForms, keyForms) {
  for (const a of msgForms) for (const b of keyForms) if (a === b) return 1;
  const a = msgForms[0], b = keyForms[0];
  const len = Math.min(a.length, b.length);
  if (len < 5) return 0; // short words must match exactly ("كوره" is not "صوره")
  const max = len >= 7 ? 2 : 1;
  for (const x of msgForms) for (const y of keyForms) {
    if (Math.min(x.length, y.length) >= 5 && levenshtein(x, y, max) <= max) return 0.8;
  }
  return 0;
}

/** Share of words two messages have in common (0..1). */
function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}

/* A "phrase" is one or more words that must all appear in the message (any order). */
function compilePhrase(text, weight = 1) {
  const words = tokenize(text); // every word counts: "انت مين" must not shrink to "مين" (that would also match "مين المدربين")
  if (!words.length) return null;
  return { words: words.map(variants), weight: words.length > 1 ? weight * 1.4 : weight };
}

function phraseScore(msg, phrase) {
  let total = 0;
  for (const keyForms of phrase.words) {
    let best = 0;
    for (const m of msg) { const s = wordMatch(m, keyForms); if (s > best) best = s; if (best === 1) break; }
    if (!best) return 0;
    total += best;
  }
  return (total / phrase.words.length) * phrase.weight;
}

/* ------------------------------------------------------------------ */
/* Built-in topics                                                     */
/* ------------------------------------------------------------------ */
// Keywords per topic (Arabic, English, Egyptian Franco), separated by "|". A leading "!" marks a strong word (counts 1.5x),
// e.g. "بكام" means prices even when the message also says "اشتراك".
const TOPICS = {
  howareyou: { weight: 0.7, words: `ازيك|ازيكم|ازيكو|عامل ايه|عاملين ايه|عامل اي|اخبارك|اخبارك ايه|ezayak|ezayek|3amel eh|how are you|how r u|whats up|wassup` },
  ack: { weight: 0.6, words: `تمام|اوك|اوكي|ok|okay|حاضر|ماشي|طيب|tamam|mashy|tayeb|cool|fine|got it` },
  who: { words: `اسمك|اسمك ايه|انت مين|مين انت|انتي مين|انت بوت|بوت|روبوت|انت حقيقي|بني ادم|انسان|who are you|your name|bot|robot|are you human|are you real|esmak|enta meen` },
  private: { words: `!برايفت|!private|!privet|!brayvet|!برايفيت|تمرين خاص|تمارين خاصه|حصه خاصه|حصص خاصه|خاص|خاصه|!فردي|!فرديه|انفرادي|لوحدي|one on one|1 on 1|!personal training|personal|individual` },
  help: { words: `تقدر تساعدني|تساعدني|ساعدني|ممكن تساعدني|محتاج مساعده|عايز مساعده|محتاج مساعدتك|تقدر تعمل ايه|بتعمل ايه|بتعرف تعمل ايه|ايه الخدمات|خدماتكم|القائمه|المنيو|help|help me|can you help|what can you do|how can you help|what do you offer|menu|options|e2dar tsa3edny` },
  confused: { words: `مش فاهم|مش فاهمه|مفهمتش|مافهمتش|يعني ايه|قصدك ايه|تقصد ايه|مش واضح|i dont understand|dont understand|what do you mean|confused|not clear|mesh fahem` },
  more: { weight: 0.8, words: `وبعدين|وايه كمان|ايه كمان|ايه تاني|حاجه تانيه|في حاجه تانيه|كمل|what else|anything else|and then|tell me more|more` },
  yes: { weight: 0.6, words: `اه|ايوه|ايوا|اكيد|نعم|yes|yeah|yep|sure|aywa` },
  no: { weight: 0.6, words: `لا|لأ|لا شكرا|مش محتاج|لا خلاص|خلاص|no|nope|no thanks|nothing|la2` },
  compare: { words: `احسن|افضل|الافضل|احسن اكاديميه|اكاديميه تانيه|اكاديميات تانيه|اكاديميه تاني|اروح اكاديميه|نادي تاني|مكان تاني|ليه اختاركم|ليه اختار|ليه انتم|ليه انتو|ايه يميزكم|مميزاتكم|مميزات|بتتميزوا|الفرق بينكم|better|best|why choose|why you|why plv|other academy|another academy|difference` },
  level: { words: `مبتدئ|مبتديء|مبتدئين|مستوي|المستوي|محترف|محترفين|مش بيعرف يلعب|ميعرفش يلعب|مبيعرفش يلعب|اول مره|عمره ما لعب|عمري ما لعبت|beginner|beginners|level|never played|first time|no experience|advanced` },
  ages: { words: `سن|السن|اعمار|الاعمار|عمر|كام سنه|سنين|السن المناسب|age|ages|age group|how old|what age|years old` },
  girls: { words: `بنات|بنت|البنات|بنتي|سيدات|ستات|فتيات|girls|girl|female|women|ladies|daughter|banat` },
  trial: { words: `تجربه|تجريبي|تجريبيه|حصه تجريبيه|تمرين تجريبي|اجرب|نجرب|يجرب|اجي اتفرج|trial|free trial|try out|test session` },
  gear: { words: `البس ايه|لبس|اللبس|يونيفورم|تيشيرت|جزمه|حذاء|اجيب ايه|احضر ايه|محتاج اجيب|ادوات|uniform|kit|shoes|what to wear|what to bring|clothes|jersey` },
  payment: { words: `ادفع|الدفع|دفع|فيزا|كاش|انستا باي|انستاباي|فودافون كاش|تقسيط|قسط|اقساط|payment|pay|visa|cash|instapay|installments|credit card` },
  greet: { weight: 0.6, words: `اهلا|ahlan|هاي|hi|hello|hey|هلو|السلام عليكم|سلام عليكم|salam|صباح الخير|مساء الخير|good morning|good evening|مرحبا|marhaba|يا هلا` },
  thanks: { weight: 0.8, words: `شكرا|متشكر|متشكرين|تسلم|تسلمي|ميرسي|merci|thanks|thank you|thx|shokran|ok thanks` },
  bye: { weight: 0.7, words: `مع السلامه|باي|bye|goodbye|سلام|يلا سلام|see you` },
  register: { words: `تسجيل|سجل|اسجل|اتسجل|نسجل|اشترك|اشتراك|اشتراكات|احجز|حجز|انضم|انضمام|التحق|register|registration|sign up|signup|join|enroll|book|booking|tasgeel|asagel|asagel ezay|eshterak|ashtarek|a2dem|اقدم|تقديم|التقديم|عايز العب|عايزه العب|العب عندكم` },
  areas: { words: `فرع|فروع|فين|مكان|اماكن|المكان|منطقه|مناطق|عنوان|العنوان|لوكيشن|location|locations|located|place|places|venue|gym|court|courts|club|branch|branches|where|area|areas|address|far3|foro3|fen|feen|makan|قريب مني` },
  coaches: { words: `مدرب|مدربين|كوتش|كوتشات|كابتن|المدرب|الكباتن|coach|coaches|trainer|trainers|coaching staff|modareb|modarbeen|captain` },
  prices: { words: `!سعر|!اسعار|!بكام|!اشتراك كام|!كام الاشتراك|!تكلفه|!مصاريف|فلوس|الشهر بكام|price|prices|cost|fee|fees|!how much|!bekam|!kam eshterak|as3ar|se3r|مواعيد|ميعاد|معاد|المواعيد|التمرين امتي|امتي|ساعه كام|ايام|schedule|timing|time|times|when|mawa3eed|me3ad|emta|tamreen emta` },
  contact: { words: `تواصل|اتواصل|رقم|الرقم|تليفون|تلفون|موبايل|واتس|واتساب|وتساب|اكلمكم|اكلم حد|كلموني|contact|phone|number|phone number|whatsapp|whats app|watsapp|call|call you|reach|talk to|rakam|raqam|wats|kalemny|موظف|حد يرد|خدمه العملاء|customer service` },
  social: { words: `فيسبوك|فيس|انستجرام|انستا|تيك توك|تيكتوك|يوتيوب|سوشيال|صفحه|صفحتكم|اكونت|facebook|instagram|insta|tiktok|youtube|social|page` },
  gallery: { words: `صور|صوره|فيديو|فيديوهات|معرض|جاليري|gallery|photos|photo|pictures|pics|videos|sowar` },
  reviews: { words: `اراء|تقييم|تقييمات|تجارب|ريفيو|reviews|review|feedback|testimonials|rating|ratings|شكوي|اقتراح|complaint|suggestion` },
  about: { words: `مين انتم|مين انتو|انتم مين|الاكاديميه|اكاديميه|عن الاكاديميه|plv|performance lab|about|about you|academy|رؤيه|رؤيتكم|هدفكم|mission|vision` },
};

/* General conversation: questions to the bot about itself, feelings, jokes… ("st_") and general volleyball knowledge ("vb_").
 * Answers live in texts.js as bot.st_* / bot.vb_* (several versions each). They never beat a real question about the academy. */
const CHAT = {
  st_age: `انت عندك كام سنه|عندك كام سنه|عمرك كام|سنك كام|انت كبير|انت صغير|how old are you|your age|3omrak kam`,
  st_live: `انت فين|انت ساكن فين|ساكن فين|عايش فين|بتعيش فين|where do you live|where are you from|enta fen`,
  st_play: `بتلعب|بتعرف تلعب|بتلعب كوره|بتحب الكوره|بتحب الكره الطائره|بتحب الرياضه|do you play|can you play|do you like volleyball`,
  st_fav: `بتشجع مين|بتشجع|فريقك|فريقك المفضل|لاعبك المفضل|اهلاوي|زملكاوي|اهلي ولا زمالك|زمالك ولا اهلي|اهلي|زمالك|ahly|zamalek|favorite team|favorite player|favourite team`,
  st_feel: `انت مبسوط|انت زعلان|انت فرحان|بتحس|عندك مشاعر|عندك احساس|are you happy|are you sad|do you have feelings`,
  st_body: `بتاكل|بتنام|بتشرب|انت متجوز|متجوز|مرتبط|عندك اصحاب|do you eat|do you sleep|are you married`,
  st_ai: `ذكاء اصطناعي|ai|chatgpt|chat gpt|شات جي بي تي|جي بي تي|gpt|انت ذكي|artificial intelligence`,
  st_maker: `مين عملك|مين صنعك|مين برمجك|مين عاملك|who made you|who created you|who built you`,
  st_joke: `نكته|قولي نكته|احكيلي نكته|ضحكني|joke|tell me a joke|make me laugh|noktah`,
  st_laugh: `هه|ههه|هاها|ههههه|لول|lol|haha|hahaha|lmao`,
  st_praise: `انت شاطر|انت جامد|انت جميل|انت حلو|انت عسل|برافو|عاش|تحفه|جامد|you are smart|good bot|great job|well done|awesome|you rock`,
  st_insult: `انت غبي|غبي|انت فاشل|فاشل|مش فاهم حاجه|انت مبتفهمش|متخلف|زفت|stupid|dumb|useless|idiot|bad bot`,
  st_love: `بحبك|حبيبي|حبيبتي|i love you|love you|ba7ebak`,
  st_sad: `زهقان|زهقانه|مضايق|مضايقه|حزين|حزينه|زعلان|تعبان|مخنوق|ملل|bored|sad|tired|upset`,
  st_bless: `الحمد لله|الحمدلله|ان شاء الله|انشاء الله|ربنا يخليك|ربنا يكرمك|تسلم ايدك|الله يسلمك|يارب|بارك الله|inshallah|alhamdulillah`,
  st_opinion: `رايك|رايك ايه|ايه رايك|بتفكر|your opinion|what do you think|what is your opinion`,
  vb_players: `كام لاعب|عدد اللاعبين|كام لاعيب|الفريق كام واحد|كام واحد في الملعب|how many players|number of players`,
  vb_points: `كام نقطه|الشوط كام|كام شوط|عدد النقاط|عدد الاشواط|نظام النقاط|بيكسب ازاي|how many points|how many sets|scoring|how do you win`,
  vb_history: `اتخترعت امتي|مين اخترع|تاريخ الكره الطائره|تاريخ الكوره الطائره|اصل الكره الطائره|who invented volleyball|history of volleyball|when was volleyball invented`,
  vb_net: `ارتفاع الشبكه|طول الشبكه|الشبكه ارتفاعها|net height|how high is the net`,
  vb_positions: `ايه المراكز|المراكز ايه|مراكز الكره الطائره|مراكز اللعب|يعني ايه ليبرو|يعني ايه سيتر|positions in volleyball|volleyball positions|what is a libero|what is a setter`,
  vb_benefits: `فوايد الكره الطائره|فوائد الكره الطائره|فايده الكره الطائره|ليه العب كره طائره|ليه الكره الطائره|benefits of volleyball|why volleyball|why play volleyball`,
};
for (const [id, words] of Object.entries(CHAT)) TOPICS[id] = { words };
const CHAT_IDS = new Set(Object.keys(CHAT).filter((k) => k.startsWith('st_')));
// The message is talking TO the bot ("انت…", "عمرك…", "you…"): small talk about the bot then counts as a real answer.
const DIRECTED_RE = /(?:^| )(?:انت|انتي|enta|enti|you|your|yours|u|عندك|عمرك|سنك|اسمك|فريقك|لاعبك|بتاعك)(?: |$)/;

const TOPIC_PHRASES = Object.fromEntries(Object.entries(TOPICS).map(([id, def]) => [
  id,
  def.words.split('|').map((w) => (w.startsWith('!')
    ? compilePhrase(w.slice(1), (def.weight ?? 1) * 1.5)
    : compilePhrase(w, def.weight ?? 1))).filter(Boolean),
]));

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */
const FRANCO_RE = /\b[a-z]*[2-9][a-z]+|\b(?:3ayez|3awez|ezay|ezayak|fen|feen|bekam|kam|mawa3eed|tasgeel|asagel|eshterak|shokran|ahlan|ana|enta|momken|el|fe|3and|3andko)\b/i;

/** "ar" when the visitor wrote Arabic or Egyptian Franco, "en" for plain English, the site language otherwise. */
export function detectLang(text, fallback = 'en') {
  if (ARABIC_RE.test(text)) return 'ar';
  if (FRANCO_RE.test(String(text))) return 'ar';
  if (/[a-z]/i.test(text)) return 'en';
  return fallback;
}

const pickField = (item, field, lang) => {
  const ar = item?.[`${field}_ar`];
  if (lang === 'ar' && typeof ar === 'string' && ar.trim()) return ar.trim();
  const v = item?.[field];
  return typeof v === 'string' && v.trim() ? v.trim() : (typeof ar === 'string' ? ar.trim() : '');
};

/* ------------------------------------------------------------------ */
/* Registration rules: identical to the site form and Registration.gs  */
/* ------------------------------------------------------------------ */
export const toAsciiDigits = (v) => String(v ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
export const normalizeName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const isValidName = (v) => /^[\p{L}\p{M}][\p{L}\p{M} .'’\-]{1,79}$/u.test(normalizeName(v));
export function normalizeMobile(value) {
  let v = toAsciiDigits(value).replace(/[\s\-.()]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  const egypt = v.match(/^(?:\+?20|0)?(1[0125]\d{8})$/);
  if (egypt) return `0${egypt[1]}`;
  if (/^\+[1-9]\d{7,14}$/.test(v)) return v;
  return null;
}
export function normalizeAge(value) {
  const v = toAsciiDigits(value).trim();
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 99 ? n : null;
}
/* "value" is exactly what the server accepts. "words" lets people type it their own way. */
export const POSITIONS = [
  { value: 'Setter', key: 'setter', words: 'setter|seter|سيتر|معد|المعد|الاعداد|اعداد|موزع' },
  { value: 'Outside Hitter', key: 'outsideHitter', words: 'outside|outside hitter|hitter|wing|ضارب|ضارب خارجي|مهاجم|مهاجم خارجي|هيتر|اوتسايد|ونج' },
  { value: 'Opposite', key: 'opposite', words: 'opposite|اوبوزيت|اوبوزت|ابوزيت|معاكس|المعاكس|مقابل|ضارب مقابل' },
  { value: 'Middle Blocker', key: 'middleBlocker', words: 'middle|middle blocker|blocker|center|بلوكر|بلوك|سنتر|اوسط|ميدل|حائط صد' },
  { value: 'Libero', key: 'libero', words: 'libero|ليبرو|ليبيرو' },
  { value: 'Not Sure Yet', key: 'notSure', words: 'مش عارف|مش عارفه|معرفش|مش متاكد|مش متاكده|لسه|مبتدئ|مبتدئه|اي حاجه|مش فارقه|not sure|dont know|no idea|beginner|any' },
].map((p) => ({ ...p, phrases: p.words.split('|').map((w) => compilePhrase(w)).filter(Boolean) }));

const REG_STEPS = ['area', 'name', 'mobile', 'age', 'position'];
const CANCEL_RE = /^(?:الغاء|الغي|كنسل|بلاش|خلاص مش عايز|مش عايز اسجل|cancel|stop|nevermind|never mind|exit)$/;
const YES_RE = /^(?:ايوه|ايوا|اه|ايوة|نعم|تمام|اكيد|اكد|تاكيد|صح|مظبوط|yes|yeah|yep|ok|okay|confirm|sure|correct|aywa|ah|tamam)$/;
const NO_RE = /^(?:لا|لأ|لاء|تعديل|عدل|غلط|no|nope|edit|change|wrong|la)$/;

const THRESHOLD = 0.75; // one whole keyword (≈1) or a strong FAQ question overlap

/**
 * @param {object} opts
 *  faq      rows of the FAQ tab: { id, question, question_ar, keywords, answer, answer_ar, link, link_label, link_label_ar }
 *  areas    published rows of the Areas tab
 *  coaches  published rows of the Coaches tab
 *  links    { register, coaches, gallery, feedback, whatsappNumber, socials:{facebook,instagram,tiktok,youtube} }
 *  tr       (lang, key, vars) => translated text
 */
export function createEngine({ faq = [], areas = [], coaches = [], reviews = null, links = {}, botName = {}, tr }) {
  // {name} in any sentence = the bot's name in that language (falls back to the default "PLV assistant" name).
  const nameFor = (lang) => String((lang === 'ar' ? botName.ar : botName.en) || botName.en || botName.ar || '').trim(); // '' = no name yet
  const say = (lang, key, vars) => tr(lang, key, { name: nameFor(lang), ...vars });

  /* FAQ rows -> phrases. Keywords are separated by commas, Arabic commas, "|" or new lines. */
  const faqEntries = faq
    .filter((r) => r && (String(r.answer || '').trim() || String(r.answer_ar || '').trim()))
    .map((row) => {
      const kw = String(row.keywords || '').split(/[,،|\n;؛]+/).map((s) => s.trim()).filter(Boolean);
      const phrases = kw.map((k) => compilePhrase(k, 1.1)).filter(Boolean);
      const questions = [row.question, row.question_ar].filter((q) => String(q || '').trim())
        .map((q) => tokenize(q).filter((w) => !STOPWORDS.has(w)).map(variants))
        .filter((q) => q.length);
      return { row, phrases, questions };
    });

  /* Area names from the data are a PLACE the question is about, not a topic: "مواعيد مصر الجديدة" is a schedule question. */
  const areaEntries = areas.map((a) => ({
    a, phrases: [a.name, a.name_ar].filter((n) => String(n || '').trim()).map((n) => compilePhrase(n, 1)).filter(Boolean),
  }));
  function findArea(msg) {
    let best = null, bestScore = 0;
    for (const e of areaEntries) for (const p of e.phrases) {
      const s = phraseScore(msg, p) / p.weight; // 1 = every word of the name is there
      if (s >= 0.9 && s > bestScore) { best = e.a; bestScore = s; }
    }
    return best;
  }

  /* Coach names: "مين كابتن أحمد؟" -> that coach's short intro (intro / intro_ar from the Coaches tab). */
  const coachEntries = coaches.map((c) => ({
    c, phrases: [c.name, c.name_ar].filter((n) => String(n || '').trim()).map((n) => compilePhrase(n, 1)).filter(Boolean),
  }));
  function findCoach(msg) {
    let best = null, bestScore = 0;
    for (const e of coachEntries) for (const p of e.phrases) {
      // every word of a one-word name, or at least two words of a longer one
      const s = phraseScore(msg, p) / p.weight;
      const need = p.words.length === 1 ? 1 : Math.min(1, 2 / p.words.length);
      if (s >= need - 1e-9 && s > bestScore) { best = e.c; bestScore = s; }
    }
    return best;
  }

  function faqScore(msg, entry, msgAll = msg) {
    let best = 0;
    for (const p of entry.phrases) best = Math.max(best, phraseScore(msgAll, p));
    for (const q of entry.questions) {
      // share of the question's meaningful words found in the message, and of the message's words found in the question
      let hit = 0;
      for (const keyForms of q) {
        let b = 0;
        for (const m of msg) { b = Math.max(b, wordMatch(m, keyForms)); if (b === 1) break; }
        hit += b;
      }
      if (!hit) continue;
      const cover = hit / q.length;
      const focus = hit / Math.max(1, msg.length);
      const s = (cover * 0.7 + focus * 0.3) * 1.25;
      if (cover >= 0.5 || hit >= 2) best = Math.max(best, s);
    }
    return best;
  }

  function topicScore(msg, id) {
    let best = 0, len = 0;
    for (const p of TOPIC_PHRASES[id]) { const s = phraseScore(msg, p); if (s > best) { best = s; len = p.words.length; } }
    return { score: best, len };
  }

  /* ---------------- answers ---------------- */
  const wa = (lang, question) => (links.whatsappNumber
    ? [{ type: 'whatsapp', label: say(lang, 'bot.btn.whatsapp'), text: question || '' }]
    : []);
  const link = (lang, labelKey, href) => (href ? [{ type: 'link', label: say(lang, labelKey), href }] : []);
  const chips = (lang, ids) => ids.map((id) => ({ intent: id, label: say(lang, `bot.chip.${id}`) }));
  const hasChipLabel = (lang, id) => say(lang, `bot.chip.${id}`) !== `bot.chip.${id}`;
  const MENU = ['register', 'areas', 'coaches', 'prices', 'contact'];
  // The four starting buttons (same as the welcome message).
  const START = (lang) => [{ intent: 'reg:start', label: say(lang, 'bot.reg.chatBtn') }, ...chips(lang, ['areas', 'contact', 'about'])];

  const answers = {
    greet: (lang) => ({ text: say(lang, 'bot.greet'), chips: START(lang) }),
    help: (lang) => ({ text: say(lang, 'bot.help'), chips: START(lang) }),
    confused: (lang) => ({ text: say(lang, 'bot.confused'), chips: START(lang) }),
    more: (lang) => ({ text: say(lang, 'bot.more'), chips: START(lang) }),
    yes: (lang) => ({ text: say(lang, 'bot.yes'), chips: START(lang) }),
    no: (lang) => ({ text: say(lang, 'bot.no') }),
    howareyou: (lang) => ({ text: say(lang, 'bot.howareyou'), chips: START(lang) }),
    ack: (lang) => ({ text: say(lang, 'bot.ack'), chips: chips(lang, MENU) }),
    who: (lang) => ({ text: say(lang, 'bot.who'), chips: chips(lang, MENU) }),
    private: (lang, q, ctx = {}) => ({
      text: ctx.area ? say(lang, 'bot.privateArea', { area: pickField(ctx.area, 'name', lang) }) : say(lang, 'bot.private'),
      actions: [...wa(lang, q), ...link(lang, 'bot.btn.register', links.register)],
    }),
    thanks: (lang) => ({ text: say(lang, 'bot.thanks'), chips: chips(lang, ['register', 'contact']) }),
    bye: (lang) => ({ text: say(lang, 'bot.bye') }),
    menu: (lang) => ({ text: say(lang, 'bot.menu'), chips: chips(lang, MENU) }),
    register: (lang, q, ctx = {}) => ({
      text: ctx.area ? say(lang, 'bot.registerArea', { area: pickField(ctx.area, 'name', lang) }) : say(lang, 'bot.register'),
      actions: [...link(lang, 'bot.btn.register', links.register), ...wa(lang)],
      chips: chips(lang, ['areas', 'prices']),
    }),
    areas: (lang, q, ctx = {}) => {
      if (ctx.area) {
        return { text: say(lang, 'bot.areaYes', { area: pickField(ctx.area, 'name', lang) }),
          actions: [...link(lang, 'bot.btn.register', links.register), ...wa(lang)], chips: chips(lang, ['prices']) };
      }
      const names = areas.map((a) => pickField(a, 'name', lang)).filter(Boolean);
      return names.length
        ? { text: say(lang, 'bot.areas', { list: names.join(lang === 'ar' ? '، ' : ', ') }),
          actions: [...link(lang, 'bot.btn.register', links.register), ...wa(lang)] }
        : { text: say(lang, 'bot.areasNone'), actions: wa(lang) };
    },
    coaches: (lang, q, ctx = {}) => {
      if (ctx.coach) {
        const name = pickField(ctx.coach, 'name', lang);
        const role = pickField(ctx.coach, 'role', lang);
        const intro = pickField(ctx.coach, 'intro', lang);
        return {
          text: say(lang, intro ? 'bot.coachOne' : 'bot.coachOneShort', { name, role: role ? ` — ${role}` : '', intro }),
          actions: link(lang, 'bot.btn.coaches', links.coaches),
        };
      }
      const list = coaches.map((c) => {
        const name = pickField(c, 'name', lang);
        const role = pickField(c, 'role', lang);
        return name ? (role ? `${name} — ${role}` : name) : '';
      }).filter(Boolean);
      return {
        text: list.length ? say(lang, 'bot.coaches', { list: list.map((l) => `• ${l}`).join('\n') }) : say(lang, 'bot.coachesNone'),
        actions: link(lang, 'bot.btn.coaches', links.coaches),
      };
    },
    prices: (lang, q, ctx = {}) => ({
      text: ctx.area ? say(lang, 'bot.pricesArea', { area: pickField(ctx.area, 'name', lang) }) : say(lang, 'bot.prices'), actions: [...wa(lang, q), ...link(lang, 'bot.btn.register', links.register)] }),
    contact: (lang) => ({
      text: say(lang, links.whatsappNumber ? 'bot.contact' : 'bot.contactNoWa'),
      actions: [...wa(lang), ...socialActions(lang)],
    }),
    social: (lang) => {
      const acts = socialActions(lang);
      return acts.length ? { text: say(lang, 'bot.social'), actions: acts } : answers.contact(lang);
    },
    gallery: (lang) => ({ text: say(lang, 'bot.gallery'), actions: link(lang, 'bot.btn.gallery', links.gallery) }),
    reviews: (lang) => ({
      text: reviews && reviews.count > 0
        ? say(lang, 'bot.reviewsSummary', { count: reviews.count, average: reviews.average.toFixed(1) })
        : say(lang, 'bot.reviews'),
      actions: link(lang, 'bot.btn.reviews', links.feedback),
    }),
    about: (lang) => ({ text: say(lang, 'bot.about'), chips: chips(lang, ['register', 'coaches', 'areas']) }),
  };

  // General conversation answers (text from texts.js); a few add a button that helps.
  const CHAT_EXTRA = {
    st_live: (lang) => {
      const names = areas.map((a) => pickField(a, 'name', lang)).filter(Boolean);
      return names.length ? { text: say(lang, 'bot.st_live', { list: names.join(lang === 'ar' ? '، ' : ', ') }) } : { text: say(lang, 'bot.st_liveNoAreas') };
    },
    st_insult: (lang) => ({ actions: wa(lang) }),
    st_sad: (lang) => ({ chips: [{ intent: 'reg:start', label: say(lang, 'bot.reg.chatBtn') }] }),
    st_play: (lang) => ({ chips: [{ intent: 'reg:start', label: say(lang, 'bot.reg.chatBtn') }] }),
    vb_positions: (lang) => ({ chips: [{ intent: 'reg:start', label: say(lang, 'bot.reg.chatBtn') }] }),
    vb_benefits: (lang) => ({ chips: [{ intent: 'reg:start', label: say(lang, 'bot.reg.chatBtn') }] }),
  };
  for (const id of Object.keys(CHAT)) {
    answers[id] = (lang) => ({ text: say(lang, `bot.${id}`), ...(CHAT_EXTRA[id] ? CHAT_EXTRA[id](lang) : {}) });
  }

  // Questions only the academy team can answer exactly (level, ages, girls, trial, gear, payment): an honest answer that
  // keeps the conversation going, logged as "needs an answer from you" until the owner adds an FAQ row for it.
  const ASK_TEAM = ['level', 'ages', 'girls', 'trial', 'gear', 'payment'];
  for (const id of ASK_TEAM) {
    answers[id] = (lang, q) => ({ text: say(lang, `bot.${id}`), actions: wa(lang, q), needsFaq: true });
  }
  answers.compare = (lang) => ({ text: say(lang, 'bot.compare') });

  function socialActions(lang) {
    const s = links.socials || {};
    return ['facebook', 'instagram', 'tiktok', 'youtube']
      .filter((k) => typeof s[k] === 'string' && /^https:\/\//.test(s[k]))
      .map((k) => ({ type: 'link', label: say(lang, `bot.btn.${k}`), href: s[k], external: true }));
  }

  function faqAnswer(entry, lang) {
    const r = entry.row;
    const text = pickField(r, 'answer', lang);
    const href = String(r.link || '').trim();
    const safeHref = /^(https:\/\/|[a-z0-9_-]+\.html|#)/i.test(href) ? href : '';
    const label = pickField(r, 'link_label', lang) || say(lang, 'bot.btn.more');
    return {
      text,
      actions: safeHref ? [{ type: 'link', label, href: safeHref, external: /^https:/i.test(safeHref) }] : [],
    };
  }

  /* ---------------- registration in the chat ----------------
   * session.reg = { lang, step, data:{area,name,mobile,age,position}, editing, startedAt }
   * Nothing is sent until the visitor confirms the summary; then the answer carries `submit` (the exact body the
   * site form sends to Registration.gs) and the page sends it. */
  const areaLabel = (value, lang) => {
    const a = areas.find((x) => x.name === value || x.name_ar === value);
    return a ? pickField(a, 'name', lang) : value;
  };
  const posLabel = (value, lang) => {
    const p = POSITIONS.find((x) => x.value === value);
    return p ? say(lang, `pos.${p.key}`) : value;
  };
  const cancelChip = (lang) => ({ intent: 'reg:cancel', label: say(lang, 'bot.reg.cancelBtn') });

  function regPrompt(reg, prefix = '') {
    const { lang } = reg;
    const lead = prefix ? `${prefix}\n\n` : '';
    if (reg.step === 'area') {
      return { text: lead + say(lang, 'bot.reg.askArea'),
        chips: [...areas.filter((a) => a.name).map((a) => ({ intent: `reg:pick:${a.name}`, label: pickField(a, 'name', lang) })), cancelChip(lang)] };
    }
    if (reg.step === 'position') {
      return { text: lead + say(lang, 'bot.reg.askPosition'),
        chips: [...POSITIONS.map((p) => ({ intent: `reg:pick:${p.value}`, label: say(lang, `pos.${p.key}`) })), cancelChip(lang)] };
    }
    if (reg.step === 'confirm') {
      const d = reg.data;
      return {
        text: lead + say(lang, 'bot.reg.summary', {
          area: areaLabel(d.area, lang), pname: d.name, mobile: d.mobile, age: d.age, position: posLabel(d.position, lang),
        }),
        chips: [
          { intent: 'reg:confirm', label: say(lang, 'bot.reg.confirmBtn') },
          { intent: 'reg:edit', label: say(lang, 'bot.reg.editBtn') },
          cancelChip(lang),
        ],
      };
    }
    return { text: lead + say(lang, `bot.reg.ask.${reg.step}`), chips: [cancelChip(lang)] };
  }

  function nextStep(reg) {
    if (reg.editing) { reg.editing = false; reg.step = 'confirm'; return; }
    reg.step = REG_STEPS.find((k) => reg.data[k] == null || reg.data[k] === '') || 'confirm';
  }

  function startReg(session, lang, area) {
    session.reg = { lang, step: 'area', data: {}, editing: false, startedAt: Date.now() };
    const reg = session.reg;
    if (!areas.some((a) => a.name)) {
      session.reg = null;
      return { lang, intent: 'reg:noAreas', text: say(lang, 'bot.reg.noAreas'), actions: wa(lang) };
    }
    if (area) reg.data.area = area.name;
    nextStep(reg);
    return { lang, intent: 'reg:start', ...regPrompt(reg, say(lang, 'bot.reg.start')) };
  }

  function endReg(session, lang, key) {
    session.reg = null;
    return { lang, intent: 'reg:cancel', text: say(lang, key), chips: chips(lang, MENU) };
  }

  function submitReg(session) {
    const reg = session.reg;
    const d = reg.data;
    const id = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
    const submit = {
      action: 'register', requestId: id, area: d.area, name: d.name, mobile: d.mobile, age: d.age, position: d.position,
      lang: reg.lang, elapsedMs: Math.max(1500, Date.now() - reg.startedAt), website: '',
    };
    session.reg = null;
    return { lang: reg.lang, intent: 'reg:submit', text: say(reg.lang, 'bot.reg.sending'), submit };
  }

  /** A field value typed (or picked) by the visitor. Returns an error key, or null when accepted. */
  function acceptValue(reg, raw, msgAll) {
    const text = String(raw).trim();
    switch (reg.step) {
      case 'area': {
        const a = areas.find((x) => x.name === text) || findArea(msgAll || tokenize(text).map(variants));
        if (!a || !a.name) return 'bot.reg.bad.area';
        reg.data.area = a.name; return null;
      }
      case 'name': {
        const n = normalizeName(text);
        if (!isValidName(n) || n.split(' ').length < 2) return isValidName(n) ? 'bot.reg.bad.fullName' : 'bot.reg.bad.name';
        reg.data.name = n; return null;
      }
      case 'mobile': {
        const found = toAsciiDigits(text).match(/\+?[\d][\d\s\-.()]{6,}\d/);
        const m = normalizeMobile(found ? found[0] : text);
        if (!m) return 'bot.reg.bad.mobile';
        reg.data.mobile = m; return null;
      }
      case 'age': {
        const nums = toAsciiDigits(text).match(/\d+/g);
        const age = nums && nums.length === 1 ? normalizeAge(nums[0]) : null;
        if (age == null) return 'bot.reg.bad.age';
        reg.data.age = age; return null;
      }
      case 'position': {
        const exact = POSITIONS.find((p) => p.value === text);
        let best = exact, bestScore = exact ? 9 : 0;
        const msg = msgAll || tokenize(text).map(variants);
        if (!exact) for (const p of POSITIONS) for (const ph of p.phrases) {
          const sc = phraseScore(msg, ph); if (sc > bestScore) { best = p; bestScore = sc; }
        }
        if (!best || bestScore < THRESHOLD) return 'bot.reg.bad.position';
        reg.data.position = best.value; return null;
      }
      default: return null;
    }
  }

  /** Free text while a registration is open. Returns null when the text is not part of the form (a question instead). */
  function regText(message, session, msgAll, topBest) {
    const reg = session.reg;
    const { lang } = reg;
    const n = normalize(message);
    if (CANCEL_RE.test(n)) return endReg(session, lang, 'bot.reg.cancelled');

    if (reg.step === 'confirm') {
      if (YES_RE.test(n)) return submitReg(session);
      if (NO_RE.test(n)) return regIntent('reg:edit', session);
      return { lang, intent: 'reg:confirm?', ...regPrompt(reg, say(lang, 'bot.reg.confirmHint')) };
    }

    // A real question in the middle ("الاشتراك بكام؟") gets answered, then the form continues.
    // Area answers are skipped on the area step, and "register" itself just repeats the current question.
    if (reg.step === 'area' || reg.step === 'position') {
      const snapshot = { ...reg.data };
      if (!acceptValue(reg, message, msgAll)) { nextStep(reg); return { lang, intent: `reg:${reg.step}`, ...regPrompt(reg) }; }
      reg.data = snapshot;
    }
    const isQuestion = topBest && topBest.score >= THRESHOLD &&
      !(topBest.kind === 'topic' && (['greet', 'thanks', 'bye', 'howareyou', 'ack', 'register', 'yes', 'no', 'more'].includes(topBest.id) ||
        (reg.step === 'area' && topBest.id === 'areas')));
    // On the mobile/age steps a message with digits is an answer; without digits it may be a question.
    const looksLikeNumber = /\d/.test(toAsciiDigits(message));
    if (isQuestion && !((reg.step === 'mobile' || reg.step === 'age') && looksLikeNumber)) return null;

    const err = acceptValue(reg, message, msgAll);
    if (err) return { lang, intent: `reg:${reg.step}?`, ...regPrompt(reg, say(lang, err)) };
    nextStep(reg);
    return { lang, intent: `reg:${reg.step}`, ...regPrompt(reg) };
  }

  /** Buttons that belong to the registration ("reg:..."). */
  function regIntent(id, session, lang) {
    if (id === 'reg:start') return startReg(session, lang);
    if (id.startsWith('reg:startArea:')) return startReg(session, lang, areas.find((a) => a.name === id.slice(14)));
    const reg = session.reg;
    if (!reg) return startReg(session, lang);
    if (id === 'reg:cancel') return endReg(session, reg.lang, 'bot.reg.cancelled');
    if (id === 'reg:confirm') return submitReg(session);
    if (id === 'reg:edit') {
      reg.step = 'confirm';
      return { lang: reg.lang, intent: 'reg:edit', text: say(reg.lang, 'bot.reg.whichField'),
        chips: [...REG_STEPS.map((k) => ({ intent: `reg:edit:${k}`, label: say(reg.lang, `bot.reg.field.${k}`) })),
          { intent: 'reg:confirm', label: say(reg.lang, 'bot.reg.confirmBtn') }] };
    }
    if (id.startsWith('reg:edit:')) {
      reg.step = id.slice(9); reg.editing = true;
      return { lang: reg.lang, intent: id, ...regPrompt(reg) };
    }
    if (id.startsWith('reg:pick:')) {
      const err = acceptValue(reg, id.slice(9));
      if (err) return { lang: reg.lang, intent: `reg:${reg.step}?`, ...regPrompt(reg, say(reg.lang, err)) };
      nextStep(reg);
      return { lang: reg.lang, intent: `reg:${reg.step}`, ...regPrompt(reg) };
    }
    return { lang: reg.lang, intent: 'reg:resume', ...regPrompt(reg) };
  }

  /** The page reports how the real submission went (see `submit` above). */
  function submitResult(ok, lang, code) {
    if (ok) return { lang, intent: 'reg:done', text: say(lang, 'bot.reg.done'), chips: chips(lang, ['prices', 'contact']) };
    return { lang, intent: 'reg:failed', text: say(lang, code === 'invalid_area' ? 'bot.reg.failArea' : 'bot.reg.fail'), actions: wa(lang) };
  }

  /** Answer for a quick-reply button (no matching needed). */
  function replyIntent(id, lang, session = {}) {
    if (id.startsWith('reg:')) return regIntent(id, session, session.reg?.lang || lang);
    const fn = answers[id] || answers.menu;
    return { lang, intent: id, ...fn(lang, '') };
  }

  /** Answer for free text typed by the visitor. */
  /** ctx.lastIntent: what the bot answered last time, so it doesn't repeat itself word for word. */
  function answer(message, siteLang, session) {
    const ctx = session;
    const lang = session.reg ? session.reg.lang : detectLang(message, siteLang);
    const all = tokenize(message);
    const meaningful = all.filter((w) => !STOPWORDS.has(w));
    const msg = (meaningful.length ? meaningful : all).map(variants);
    const msgAll = all.map(variants); // topic keywords are whole phrases, so they are checked against every word
    if (!msg.length) return session.reg ? { lang: session.reg.lang, intent: 'reg:resume', ...regPrompt(session.reg) } : { lang, intent: 'menu', ...answers.menu(lang) };

    const candidates = [];
    faqEntries.forEach((e, i) => {
      const s = faqScore(msg, e, msgAll);
      if (s > 0) candidates.push({ kind: 'faq', i, score: s + 0.15 }); // the owner's own answers win a tie
    });
    for (const id of Object.keys(TOPICS)) {
      const { score: s, len } = topicScore(msgAll, id);
      if (s > 0) candidates.push({ kind: 'topic', id, score: s, len });
    }
    // Small talk only wins when nothing else was asked ("السلام عليكم، عايز اسجل" -> register).
    // Chat about the bot is small talk too, unless the message is addressed to the bot.
    const directed = DIRECTED_RE.test(normalize(message));
    const SMALL = new Set(['greet', 'thanks', 'bye', 'howareyou', 'ack', 'yes', 'no', 'more', 'help', 'confused', ...CHAT_IDS]);
    const real = candidates.filter((c) => !(c.kind === 'topic' && SMALL.has(c.id)));
    const pool = real.some((c) => c.score >= THRESHOLD) ? real : candidates;
    pool.sort((a, b) => b.score - a.score);
    let best = pool[0];
    // A message that is ONLY a question to the bot ("how old are you", "انت عندك كام سنه") gets the chat answer,
    // even if an FAQ keyword ("عمر", "how old") also appears. A real request in the same message still wins.
    if (directed) {
      const pure = candidates.filter((c) => c.kind === 'topic' && CHAT_IDS.has(c.id) && c.score >= THRESHOLD && c.len >= all.length - 1)
        .sort((a, b) => b.score - a.score)[0];
      if (pure) best = pure;
    }
    const area = findArea(msgAll);
    const coach = findCoach(msgAll);

    // The owner's FAQ answer beats a "ask our team" topic on the same subject.
    if (best && best.kind === 'topic' && ASK_TEAM.includes(best.id)) {
      const f = pool.find((c) => c.kind === 'faq' && c.score >= THRESHOLD);
      if (f) best = f;
    }

    // "اه" / "تمام" right after "تحب أسجلك؟" -> start the registration; "لا" -> fine.
    if (!session.reg && session.offer && best && best.kind === 'topic' && ['yes', 'ack'].includes(best.id) && all.length <= 3) {
      if (session.offer === 'reg') return startReg(session, lang);
    }

    if (session.reg) {
      const r = regText(message, session, msgAll, best);
      if (r) return { ...r, debug: [] };
      // It was a question: answer it below, then remind where the form stopped.
    }
    // (After the registration step, so a player who shares a coach's name is still a name.)
    // A coach's name with a coaches question, or on its own ("كابتن أحمد؟") -> that coach.
    if (coach && (!best || best.score < THRESHOLD || (best.kind === 'topic' && ['coaches', 'about', 'who'].includes(best.id)))) {
      best = { kind: 'topic', id: 'coaches', score: 1 };
    }
    // Only an area name: "طب وفي التجمع؟" right after a prices / private / register answer continues that topic;
    // otherwise it confirms the area ("مصر الجديدة؟", "انتو في التجمع").
    if (area && (!best || best.score < THRESHOLD)) {
      const carry = ['prices', 'private', 'register'].includes(session.lastTopic) ? session.lastTopic : 'areas';
      best = { kind: 'topic', id: carry, score: 1 };
    }
    const debug = pool.slice(0, 5).map((c) => ({
      name: c.kind === 'faq' ? `FAQ ${faqEntries[c.i].row.id || c.i + 1}` : c.id, score: Math.round(c.score * 100) / 100,
    }));

    const small = best && best.kind === 'topic' && SMALL.has(best.id);
    if (!best || best.score < (small ? 0.5 : THRESHOLD)) {
      // A question to the bot that has no specific answer still gets a friendly reply (and is logged as unanswered).
      if (directed && !session.reg) {
        return { lang, intent: 'st_generic', miss: true, text: say(lang, 'bot.st_generic'), chips: chips(lang, ['register', 'about']), debug };
      }
      // Random letters ("asdfgh") get the site language; real English ("what's the weather") stays English.
      const fbLang = lang === 'en' && !candidates.length && !all.some((w) => /^[a-z]+$/.test(w) && STOPWORDS.has(w)) ? siteLang : lang;
      return {
        lang: fbLang, intent: 'fallback', miss: true,
        text: say(fbLang, links.whatsappNumber ? 'bot.unknown' : 'bot.unknownNoWa'),
        actions: wa(fbLang, message),
        chips: START(fbLang),
        debug,
      };
    }

    const out = best.kind === 'faq'
      ? { intent: `faq:${faqEntries[best.i].row.id || best.i}`, ...faqAnswer(faqEntries[best.i], lang) }
      : { intent: best.id, ...answers[best.id](lang, message, { area, coach: best.id === 'coaches' ? coach : null }) };
    if (area) out.area = area.name || area.name_ar;

    // The SAME question asked again (not just another question on the same topic) -> the answer didn't help: offer a person.
    const sameQuestion = overlap(all, ctx.lastTokens || []) >= 0.6;
    if (sameQuestion && ctx.lastIntent === out.intent && !SMALL.has(out.intent) && !/^(st_|vb_|help|confused|more|yes|no)/.test(out.intent) && links.whatsappNumber) {
      out.text = `${say(lang, 'bot.repeat')}\n\n${out.text}`;
      if (!(out.actions || []).some((a) => a.type === 'whatsapp')) out.actions = [...wa(lang, message), ...(out.actions || [])];
      else out.actions = out.actions.map((a) => (a.type === 'whatsapp' ? { ...a, text: message } : a));
    }

    // A second clear topic in the same message ("مواعيد وفروع؟") is offered as a button.
    const second = pool.find((c) => c !== best && c.kind === 'topic' && !SMALL.has(c.id) && c.score >= THRESHOLD &&
      !(best.kind === 'topic' && c.id === best.id));
    // (only topics that have a button label: a missing label must never show as raw text)
    if (second && hasChipLabel(lang, second.id) && !(out.chips || []).some((c) => c.intent === second.id)) {
      out.chips = [{ intent: second.id, label: say(lang, `bot.chip.${second.id}`), second: true }, ...(out.chips || [])].slice(0, 4);
    }
    if (session.reg) {
      const p = regPrompt(session.reg, say(lang, 'bot.reg.resume'));
      out.text = `${out.text}\n\n${p.text}`;
      out.chips = p.chips;
    } else if (best.kind === 'topic' && best.id === 'register') {
      // "عايز اسجل" -> offer to register right here in the chat (keeping any area they named).
      out.chips = [{ intent: area ? `reg:startArea:${area.name}` : 'reg:start', label: say(lang, 'bot.reg.chatBtn') }, ...(out.chips || [])].slice(0, 4);
    }
    out.rebuild = () => (best.kind === 'faq' ? null : answers[best.id](lang, message, { area, coach: best.id === 'coaches' ? coach : null }).text);
    return { lang, ...out, debug };
  }

  /* ---------------- keep the conversation going ---------------- */
  const OFFER_REG = /^(faq:|prices|private|areas|about|compare|coaches|level|ages|girls|trial|gear|payment|vb_positions|vb_benefits)/;
  const INFO = /^(faq:|prices|private|areas|about|compare|coaches|gallery|reviews|contact|social|level|ages|girls|trial|gear|payment|vb_|st_generic)/;
  // Buttons that make sense after each kind of answer. The topic just answered, and topics already answered in this
  // conversation, are never offered again; at most 3 buttons.
  const NEXT = {
    areas: ['reg:start', 'prices'], prices: ['reg:start', 'areas'], private: ['reg:start', 'areas'],
    coaches: ['reg:start', 'about'], about: ['reg:start', 'coaches', 'areas'], compare: ['reg:start', 'coaches'],
    gallery: ['reg:start', 'about'], reviews: ['reg:start', 'about'], contact: [], social: [],
    level: ['reg:start'], ages: ['reg:start'], girls: ['reg:start'], trial: ['reg:start'], gear: ['reg:start'], payment: ['reg:start'],
    faq: ['reg:start'], st_generic: ['reg:start', 'about'], vb_positions: ['reg:start'], vb_benefits: ['reg:start'],
  };
  // Answers that list what the bot can do keep all their buttons.
  const SHOW_ALL = new Set(['menu', 'help', 'confused', 'more', 'yes', 'fallback']);
  const chipFor = (lang, id) => (id === 'reg:start' || id === 'register'
    ? { intent: 'reg:start', label: say(lang, 'bot.reg.chatBtn') }
    : { intent: id, label: say(lang, `bot.chip.${id}`) });

  function finish(out, session, message) {
    const lang = out.lang;
    // Never the exact same sentence twice in a row: pick another version when there is one.
    for (let i = 0; i < 4 && out.rebuild && out.text && out.text === session.lastText; i++) {
      const t = out.rebuild(); if (t) out.text = t;
    }
    delete out.rebuild;

    let offer = null;
    if (!session.reg && !out.submit && INFO.test(out.intent || '')) {
      // Offer registration after useful answers, but not twice in a row if the visitor ignored it.
      offer = OFFER_REG.test(out.intent) && session.offer !== 'reg' ? 'reg' : 'more';
      out.text = `${out.text}\n\n${say(lang, offer === 'reg' ? 'bot.follow.reg' : 'bot.follow.more')}`;
    }
    const intent = out.intent || '';
    const base = intent.startsWith('faq:') ? 'faq' : intent;
    if (!session.reg && !intent.startsWith('reg:')) {
      const seenTopics = new Set(session.seen || []);
      // A second topic the visitor asked about in the same message comes first; then the next steps for this answer.
      const wanted = INFO.test(intent)
        ? [...(out.chips || []).filter((c) => c.second).map((c) => c.intent), ...(NEXT[base] || ['reg:start'])]
        : (out.chips || []).map((c) => c.intent);
      const ids = [];
      for (const raw of wanted) {
        const id = raw === 'register' ? 'reg:start' : raw;
        if (!id || id === base || ids.includes(id)) continue;
        if (id !== 'reg:start' && !SHOW_ALL.has(base) && seenTopics.has(id)) continue;
        ids.push(id);
      }
      out.chips = ids.slice(0, SHOW_ALL.has(base) ? 5 : 3).map((id) => chipFor(lang, id));
      // "Register here in the chat" makes the separate "Register now" (form page) button redundant.
      if (ids.includes('reg:start') && links.register) out.actions = (out.actions || []).filter((a) => a.href !== links.register);
    }
    if (INFO.test(intent) || base === 'register') session.seen = [...new Set([...(session.seen || []), base])];
    if (out.needsFaq) { out.miss = true; delete out.needsFaq; }

    session.offer = offer;
    session.lastText = out.text;
    session.lastTokens = message ? tokenize(message) : [];
    const it = out.intent || '';
    if (/^(prices|private|register|areas|coaches|compare|level|ages|girls|trial|gear|payment|faq:)/.test(it)) session.lastTopic = it;
    return out;
  }

  function reply(message, siteLang = 'en', session = {}) {
    return finish(answer(message, siteLang, session), session, message);
  }
  function replyIntentKeep(id, lang, session = {}) {
    return finish(replyIntent(id, lang, session), session, '');
  }

  return { reply, replyIntent: replyIntentKeep, submitResult };
}
