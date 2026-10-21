// القوالب الجاهزة — كل قالب = نمط كامل يُطبَّق على المشروع
export const BASE_STYLE = {
  fontAr: 'Amiri Quran', fontTr: 'Inter', arSize: 90, trSize: 42, tafsirSize: 36,
  textColor: '#ffffff', accent: '#d4af37', trColor: '#e9e4d4',
  vpos: 'center', box: 'none', boxColor: '#000000', boxOpacity: 0.35,
  overlay: 'gradient', overlayOpacity: 0.55, tint: '#06261c',
  textAnim: 'fade', bgMotion: 'kenburns', transition: 'fade',
  particles: 'none', rays: false, pattern: 'none', frame: 'none',
  showTr: true, showTafsir: false, showRef: true, shadow: true,
  handle: '', progress: false, defaultBg: 'g-emerald',
};

export const TEMPLATES = [
  { id: 'sakinah', name: 'سكينة', desc: 'ذهبي على زمردي مع غبار نور وإطار زخرفي',
    style: { overlay: 'gradient', particles: 'dust', frame: 'arch', textAnim: 'fade', defaultBg: 'g-emerald' } },
  { id: 'haram-night', name: 'ليل الحرم', desc: 'نجوم متلألئة وكلمات تظهر تباعاً',
    style: { particles: 'stars', textAnim: 'words', overlay: 'vignette', overlayOpacity: 0.7, frame: 'corners', defaultBg: 'g-night', accent: '#e8c766' } },
  { id: 'fajr', name: 'نور الفجر', desc: 'أشعة ضوء دافئة وظهور ناعم',
    style: { rays: true, particles: 'bokeh', textAnim: 'blur', overlay: 'gradient', overlayOpacity: 0.45, defaultBg: 'g-dawn', accent: '#ffd89a' } },
  { id: 'glass', name: 'زجاجي', desc: 'بطاقة زجاجية أسفل الشاشة — مناسب للصور',
    style: { box: 'glass', vpos: 'lower', overlay: 'none', textAnim: 'rise', fontAr: 'Amiri Quran', arSize: 80, bgMotion: 'zoomin' } },
  { id: 'ribbon', name: 'شريط', desc: 'شريط داكن عريض مع إبراز تزامني للكلمات',
    style: { box: 'ribbon', boxOpacity: 0.62, overlay: 'none', textAnim: 'highlight', vpos: 'center', bgMotion: 'panleft' } },
  { id: 'manuscript', name: 'مخطوطة', desc: 'ورق عتيق ونص داكن وإطار مزدوج',
    style: { textColor: '#2a1d0b', trColor: '#4a3a22', accent: '#8a5a12', overlay: 'none', frame: 'double', pattern: 'none', shadow: false, defaultBg: 'g-sand', textAnim: 'typewriter', bgMotion: 'none' } },
  { id: 'minimal', name: 'بسيط', desc: 'أبيض نقي على خلفية داكنة، بلا زخارف',
    style: { overlay: 'dark', overlayOpacity: 0.5, fontAr: 'Noto Naskh Arabic', arSize: 80, textAnim: 'fade', defaultBg: 'g-ink', showTr: true } },
  { id: 'bold', name: 'تيك توك جريء', desc: 'خط عريض وحركة تكبير سريعة',
    style: { fontAr: 'Cairo', arSize: 92, textAnim: 'zoom', transition: 'zoom', overlay: 'dark', overlayOpacity: 0.55, accent: '#ffcc33', bgMotion: 'zoomin', progress: true } },
  { id: 'zakhrafa', name: 'زخرفة', desc: 'نقش هندسي إسلامي متحرك في الخلفية',
    style: { pattern: 'star8', overlay: 'tint', overlayOpacity: 0.6, frame: 'thin', textAnim: 'words', defaultBg: 'g-gold', accent: '#e9c46a' } },
  { id: 'tafsir', name: 'آية وتفسير', desc: 'الآية أعلى وصندوق التفسير الميسّر أسفلها',
    style: { vpos: 'upper', showTafsir: true, showTr: false, box: 'card', boxOpacity: 0.45, arSize: 80, textAnim: 'fade', overlay: 'dark', overlayOpacity: 0.5, particles: 'dust' } },
  { id: 'rose', name: 'وردي هادئ', desc: 'تدرج وردي وفقاعات ضوء ناعمة',
    style: { particles: 'bokeh', overlay: 'gradient', defaultBg: 'g-rose', accent: '#f2c6d6', textAnim: 'rise', frame: 'corners' } },
  { id: 'snow', name: 'شتاء', desc: 'تساقط ناعم وتدرج سماوي',
    style: { particles: 'snow', overlay: 'gradient', overlayOpacity: 0.5, defaultBg: 'g-sky', textAnim: 'words', accent: '#ffffff', trColor: '#eaf4ff' } },
];

export function styleFromTemplate(id) {
  const t = TEMPLATES.find(x => x.id === id) || TEMPLATES[0];
  return { ...BASE_STYLE, ...t.style };
}
