// المصادر: QuranEnc (مصحف المدينة + الترجمات المعتمدة + التفسير الميسر/المختصر)
//          HadeethEnc (موسوعة الأحاديث المترجمة) — كلها عبر خادم الوسيط لتفادي CORS
//          أقوال ابن القيم وابن الجوزي — منتقاة يدوياً ومُحالة إلى صفحات المكتبة الشاملة/إسلام ويب
const memo = new Map();
async function getJson(url) {
  if (memo.has(url)) return memo.get(url);
  const p = fetch(url).then(async r => { if (!r.ok) throw new Error('تعذر الجلب من المصدر (' + r.status + ')'); return r.json(); });
  memo.set(url, p);
  p.catch(() => memo.delete(url));
  return p;
}

// ---------- القرآن ----------
export const TAFSIRS = [
  { key: 'arabic_moyassar', label: 'التفسير الميسر — مجمع الملك فهد' },
  { key: 'arabic_mokhtasar', label: 'المختصر في تفسير القرآن الكريم' },
];
const LANG_NAMES = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', tr: 'Türkçe', ur: 'اردو', id: 'Bahasa Indonesia', fa: 'فارسی', hi: 'हिन्दी', zh: '中文', ja: '日本語', sw: 'Kiswahili', tl: 'Tagalog', bs: 'Bosanski', bn: 'বাংলা', ru: 'Русский', ms: 'Melayu', it: 'Italiano', pt: 'Português', ko: '한국어', th: 'ไทย', vi: 'Tiếng Việt', ha: 'Hausa', so: 'Soomaali', am: 'አማርኛ', ps: 'پښتو', ku: 'Kurdî', ug: 'ئۇيغۇرچە', uz: 'Oʻzbek', az: 'Azərbaycan', sq: 'Shqip', nl: 'Nederlands', pl: 'Polski', ro: 'Română', uk: 'Українська', ta: 'தமிழ்', ml: 'മലയാളം', te: 'తెలుగు', gu: 'ગુજરાતી', mr: 'मराठी', ne: 'नेपाली', si: 'සිංහල', km: 'ខ្មែរ', yo: 'Yorùbá', ka: 'ქართული', he: 'עברית', kk: 'Қазақ', ky: 'Кыргызча', tg: 'Тоҷикӣ', dv: 'ދިވެހި', fil: 'Filipino' };
export const langName = (c) => LANG_NAMES[c] || c;

export async function quranTranslations() {
  const r = await getJson('/api/quranenc/translations/list');
  return (r.translations || []).filter(t => !/^arabic_/.test(t.key)).map(t => ({
    key: t.key, lang: t.language_iso_code, dir: t.direction, title: t.title,
  })).sort((a, b) => (a.lang === 'en' ? -1 : 0) - (b.lang === 'en' ? -1 : 0) || langName(a.lang).localeCompare(langName(b.lang)));
}

// يُعيد آيات السورة كاملة (يُخزَّن في الذاكرة)
export async function suraText(key, sura) {
  const r = await getJson(`/api/quranenc/translation/sura/${key}/${sura}`);
  return (r.result || []).map(x => ({ sura: +x.sura, aya: +x.aya, ar: x.arabic_text, tr: cleanTr(x.translation), footnotes: x.footnotes || '' }));
}
// تنظيف علامات الحواشي مثل [98] فقط — دون أي تعديل للمعنى
export const cleanTr = (s) => String(s || '').replace(/\s*\[\d+\]/g, '').replace(/\s{2,}/g, ' ').trim();

export const recitationUrl = (reciter, s, a) => `/api/audio/${reciter}/${String(s).padStart(3, '0')}${String(a).padStart(3, '0')}.mp3`;

// ---------- الحديث ----------
export async function hadithLanguages() { return getJson('/api/hadeethenc/languages'); }
export async function hadithRoots(lang = 'ar') { return getJson(`/api/hadeethenc/categories/roots/?language=${lang}`); }
export async function hadithCategories(lang = 'ar') { return getJson(`/api/hadeethenc/categories/list/?language=${lang}`); }
export async function hadithList(cat, page = 1, lang = 'ar') { return getJson(`/api/hadeethenc/hadeeths/list/?language=${lang}&category_id=${cat}&page=${page}&per_page=20`); }
export async function hadithOne(id, lang = 'ar') { return getJson(`/api/hadeethenc/hadeeths/one/?language=${lang}&id=${id}`); }

// ---------- أقوال السلف ----------
// النصوص بلا تشكيل لتفادي أي خطأ في الحركات؛ كل قول مُحال إلى صفحته في المصدر.
export const stripTashkeel = (s) => s.replace(/[ً-ْٰـ]/g, '');
const Q = (scholar, book, text, ref, url) => ({ scholar, book, text: stripTashkeel(text), ref, url });
const IQ = 'ابن القيم', IJ = 'ابن الجوزي';
export const SALAF_QUOTES = [
  Q(IQ, 'الفوائد', 'إضاعة الوقت أشد من الموت؛ لأن إضاعة الوقت تقطعك عن الله والدار الآخرة، والموت يقطعك عن الدنيا وأهلها.', 'ط. عطاءات العلم، ص44', 'https://shamela.ws/book/212/52'),
  Q(IQ, 'الفوائد', 'الدنيا من أولها إلى آخرها لا تساوي غم ساعة؛ فكيف بغم العمر؟!', 'ط. عطاءات العلم، ص44', 'https://shamela.ws/book/212/52'),
  Q(IQ, 'الفوائد', 'السنة شجرة، والشهور فروعها، والأيام أغصانها، والساعات أوراقها، والأنفاس ثمرها', 'ط. العلمية، ص164', 'https://shamela.ws/book/6832/161'),
  Q(IQ, 'الفوائد', 'خراب القلب من الأمن والغفلة، وعمارته من الخشية والذكر.', 'ط. عطاءات العلم، ص143', 'https://shamela.ws/book/212/151'),
  Q(IQ, 'الفوائد', 'لا تدخل محبة الله في قلب فيه حب الدنيا إلا كما يدخل الجمل في سم الإبرة.', 'ط. عطاءات العلم، ص143', 'https://shamela.ws/book/212/151'),
  Q(IQ, 'الفوائد', 'من وطن قلبه عند ربه سكن واستراح، ومن أرسله في الناس اضطرب واشتد به القلق.', 'ط. عطاءات العلم، ص143', 'https://shamela.ws/book/212/151'),
  Q(IQ, 'الفوائد', 'من شغل بنفسه شغل عن غيره، ومن شغل بربه شغل عن نفسه.', 'ط. عطاءات العلم، ص144', 'https://shamela.ws/book/212/152'),
  Q(IQ, 'الفوائد', 'الناس في الدنيا معذبون على قدر هممهم بها.', 'ط. عطاءات العلم، ص144', 'https://shamela.ws/book/212/152'),
  Q(IQ, 'الفوائد', 'فإضاعة القلب من إيثار الدنيا على الآخرة، وإضاعة الوقت من طول الأمل.', 'ط. عطاءات العلم، ص162', 'https://shamela.ws/book/212/170'),
  Q(IQ, 'الفوائد', 'فالغضب مثل السبع إذا أفلته صاحبه بدأ بأكله', 'ط. العلمية، ص159', 'https://shamela.ws/book/6832/156'),
  Q(IQ, 'الفوائد', 'الصبر عن الشهوة أسهل من الصبر على ما توجبه الشهوة', 'ط. العلمية، ص139', 'https://shamela.ws/book/6832/136'),
  Q(IQ, 'الداء والدواء', 'فإن العلم نور يقذفه الله في القلب، والمعصية تطفئ ذلك النور.', 'ط. عطاءات العلم، ص132', 'https://shamela.ws/book/98093/199'),
  Q(IJ, 'صيد الخاطر', 'ينبغي للإنسان أن يعرف شرف زمانه، وقدر وقته، فلا يضيع منه لحظة في غير قربة', 'ط. دار القلم، ص33', 'https://shamela.ws/book/12028/43'),
  Q(IJ, 'صيد الخاطر', 'من أحب تصفية الأحوال، فليجتهد في تصفية الأعمال', 'ط. دار القلم', 'https://shamela.ws/book/12028/39'),
  Q(IJ, 'صيد الخاطر', 'من سره أن تدوم له العافية، فليتق الله', 'ط. دار القلم', 'https://shamela.ws/book/12028/39'),
  Q(IJ, 'صيد الخاطر', 'المواعظ كالسياط، والسياط لا تؤلم بعد انقضائها، وإيلامها وقت وقوعها.', 'ط. دار القلم، ص24', 'https://shamela.ws/book/12028/23'),
  Q(IJ, 'صيد الخاطر', 'من قارب الفتنة، بعدت عنه السلامة، ومن ادعى الصبر، وكل إلى نفسه.', 'ط. دار القلم، ص26', 'https://shamela.ws/book/12028/27'),
  Q(IJ, 'صيد الخاطر', 'من تفكر في عواقب الدنيا، أخذ الحذر، ومن أيقن بطول الطريق، تأهب للسفر.', 'ط. دار القلم، ص26', 'https://shamela.ws/book/12028/26'),
  Q(IJ, 'صيد الخاطر', 'والتقوى أصل السلامة، حارس لا ينام، يأخذ باليد عند العثرة', 'ط. دار القلم، ص137', 'https://shamela.ws/book/12028/199'),
  Q(IJ, 'صيد الخاطر', 'فالسعيد من لازم أصلا واحدا على كل حال، وهو تقوى الله عز وجل', 'ط. دار القلم، ص137', 'https://shamela.ws/book/12028/199'),
  Q(IJ, 'صيد الخاطر', 'أبله الناس من عمل على الحال الحاضرة، ولم يتصور تغيرها', 'ط. دار القلم، ص347', 'https://shamela.ws/book/12028/557'),
  Q(IJ, 'صيد الخاطر', 'فالعاقل لا يدخل في شيء حتى يهيئ الخروج منه', 'ط. دار القلم، ص347', 'https://shamela.ws/book/12028/557'),
  Q(IJ, 'صيد الخاطر', 'من علامة كمال العقل علو الهمة، والراضي بالدون دني.', 'كما في موسوعة الأخلاق — الدرر السنية', 'https://dorar.net/aadab/1117'),
  Q(IJ, 'تلبيس إبليس', 'اعلم أن الباب الأعظم الذي يدخل منه إبليس على الناس هو الجهل', 'ج1 ص131 — مكتبة إسلام ويب', 'https://www.islamweb.net/ar/library/content/1044/77/'),
];
