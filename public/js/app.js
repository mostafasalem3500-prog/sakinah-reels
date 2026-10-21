import { SURAH_NAMES, AYAH_COUNTS, SUGGESTED_AYAT, FORMATS, FONTS_AR, RECITERS, GEN_BACKGROUNDS } from './data.js';
import { TEMPLATES, BASE_STYLE, styleFromTemplate } from './templates.js';
import { renderFrame, totalDuration, sceneAt, clearLayoutCache, suggestDuration, toArDigits, isRtl } from './render.js';
import * as SRC from './sources.js';
import * as Drive from './drive.js';

// ================= أدوات =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtT = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
let toastT;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const ICON = {
  templates: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  quran: '<path d="M12 6c-2-1.6-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6-.1-8 1.5z"/><path d="M12 6v14"/>',
  hadith: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 10h8M8 14h8M8 18h5"/>',
  salaf: '<path d="M7 7h4v4c0 3-2 5-4 6M15 7h4v4c0 3-2 5-4 6"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  media: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
  style: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 000 16c1.5 0 2-1 2-2s-1-1.5-1-2.5S14 14 15 14h2a3 3 0 003-3c0-4-3.6-7-8-7z"/><circle cx="8" cy="11" r="1"/><circle cx="12" cy="8" r="1"/>',
  scene: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  projects: '<path d="M3 7h6l2 2h10v10H3z"/>',
};
const TABS = [['templates', 'قوالب'], ['quran', 'القرآن'], ['hadith', 'الحديث'], ['salaf', 'السلف'], ['text', 'نص'], ['media', 'وسائط'], ['style', 'تنسيق'], ['scene', 'المشهد'], ['projects', 'مشاريع']];

// ================= الحالة =================
const SAMPLE_CONTENT = { type: 'text', ar: 'سبحان الله وبحمده، سبحان الله العظيم', ref: 'متفق عليه' };
function newProject(tpl = 'sakinah') {
  return { v: 1, id: uid(), name: 'ريل جديد', format: '9:16', template: tpl, style: styleFromTemplate(tpl), scenes: [], extraAudio: null, extraVol: 0.6, driveFileId: null, updated: Date.now() };
}
let project = LS.get('rs.project', null) || newProject();
project.style = { ...BASE_STYLE, ...project.style };
let selected = 0;
const media = new Map(); // id -> {id,name,kind,mime,url,el,ready,driveId,progress}
let t = 0, playing = false, startNow = 0, startT = 0, exporting = false;

const view = $('#view'), vctx = view.getContext('2d');
const env = { getMedia: (id) => media.get(id), canFilter: (() => { const c = document.createElement('canvas').getContext('2d'); if (!('filter' in c)) return false; c.filter = 'blur(2px)'; return c.filter === 'blur(2px)'; })() };

// ================= الحفظ المحلي (بدون وسائط) =================
let saveT;
function touch(opts = {}) {
  project.updated = Date.now();
  clearTimeout(saveT);
  saveT = setTimeout(() => LS.set('rs.project', serializeProject()), 400);
  if (!opts.noThumbs) scheduleThumbs();
  updateTransport();
  requestDraw();
}
function serializeProject() {
  const used = new Set(project.scenes.map(s => s.media?.ref).filter(Boolean));
  if (project.extraAudio) used.add(project.extraAudio);
  const mediaRefs = [...used].filter(id => media.has(id)).map(id => { const m = media.get(id); return { id: m.id, name: m.name, kind: m.kind, mime: m.mime, driveId: m.driveId || null }; });
  return { ...project, mediaRefs };
}

// ================= الوسائط =================
function makeElement(m) {
  if (m.kind === 'image') {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { m.ready = true; requestDraw(); scheduleThumbs(); renderMediaGrid(); };
    img.src = m.url; m.el = img;
  } else if (m.kind === 'video') {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.onloadeddata = () => { m.ready = true; requestDraw(); scheduleThumbs(); renderMediaGrid(); };
    v.onseeked = () => requestDraw();
    v.src = m.url; m.el = v;
  } else if (m.kind === 'audio') {
    const a = new Audio(); a.preload = 'auto'; a.src = m.url; m.el = a;
    a.onloadedmetadata = () => { m.ready = true; m.dur = a.duration; renderAudioInfo(); };
    routeAudio(a);
  }
}
const kindOf = (mime) => mime?.startsWith('video') ? 'video' : mime?.startsWith('audio') ? 'audio' : 'image';

function addLocalFile(file) {
  const id = 'l:' + uid();
  const m = { id, name: file.name, kind: kindOf(file.type), mime: file.type, url: URL.createObjectURL(file), ready: false, driveId: null, progress: null, blob: file };
  media.set(id, m); makeElement(m);
  if ($('#autoUp').checked && Drive.isConnected()) uploadMedia(m);
  else if ($('#autoUp').checked && !Drive.isConnected()) toast('اربط درايف ليتم حفظ الوسائط فيه — الملف الآن في ذاكرة المتصفح فقط');
  return m;
}
async function uploadMedia(m) {
  if (m.driveId || !m.blob) return;
  m.progress = 0; renderMediaGrid();
  try {
    const r = await Drive.upload(m.blob, m.name, 'media', { onProgress: (p) => { m.progress = p; const bar = $(`[data-mid="${CSS.escape(m.id)}"] .bar i`); if (bar) bar.style.width = (p * 100) + '%'; } });
    m.driveId = r.id; m.progress = null; m.blob = null; // لا نحتفظ بنسخة إضافية
    touch({ noThumbs: true });
  } catch (e) { m.progress = null; toast('فشل الرفع: ' + e.message); }
  renderMediaGrid();
}
function registerDriveFile(f) {
  const id = 'd:' + f.id;
  if (media.has(id)) return media.get(id);
  for (const m of media.values()) if (m.driveId === f.id) return m;
  const m = { id, name: f.name, kind: kindOf(f.mimeType), mime: f.mimeType, url: null, ready: false, driveId: f.id, thumb: f.thumbnailLink, loading: null };
  media.set(id, m);
  return m;
}
async function ensureLoaded(m) {
  if (!m) return;
  if (m.el) return;
  if (!m.driveId) return;
  if (!Drive.isConnected()) return;
  if (!m.loading) m.loading = (async () => {
    const blob = await Drive.download(m.driveId);
    m.url = URL.createObjectURL(blob); makeElement(m);
  })().catch(e => { m.loading = null; toast('تعذر تحميل ' + m.name + ': ' + e.message); });
  return m.loading;
}
async function ensureSceneMedia() {
  const ids = new Set(project.scenes.map(s => s.media?.ref).filter(id => id && media.has(id)));
  if (project.extraAudio) ids.add(project.extraAudio);
  await Promise.all([...ids].map(id => ensureLoaded(media.get(id))));
}

// ================= الصوت (WebAudio للمعاينة والتصدير) =================
let AC = null, master = null, streamDest = null;
const routed = new WeakSet(), pendingRoute = new Set();
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.connect(AC.destination);
  streamDest = AC.createMediaStreamDestination(); master.connect(streamDest);
  pendingRoute.forEach(routeAudio); pendingRoute.clear();
}
function routeAudio(elm) {
  if (routed.has(elm)) return;
  if (!AC) { pendingRoute.add(elm); return; }
  try { const src = AC.createMediaElementSource(elm); const g = AC.createGain(); src.connect(g).connect(master); elm._gain = g; routed.add(elm); } catch (e) { console.warn(e); }
}
const audioEls = new Map();
function audioEl(url) {
  if (!audioEls.has(url)) { const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.src = url; audioEls.set(url, a); routeAudio(a); }
  return audioEls.get(url);
}
function probeDuration(url) {
  return new Promise((res) => { const a = audioEl(url); if (a.readyState >= 1 && isFinite(a.duration)) return res(a.duration); const on = () => { a.removeEventListener('loadedmetadata', on); res(isFinite(a.duration) ? a.duration : 0); }; a.addEventListener('loadedmetadata', on); a.addEventListener('error', () => res(0), { once: true }); a.load(); setTimeout(() => res(0), 15000); });
}
const AUDIO_DELAY = 0.3;

// مزامنة الفيديو والصوت مع الزمن
function syncMedia(time, isPlaying) {
  const want = new Map();
  if (project.scenes.length) {
    const { i, lt } = sceneAt(project, time);
    const addVideo = (sc, ltime) => { const m = media.get(sc.media?.ref); if (m?.kind === 'video' && m.el && m.ready) { const d = m.el.duration || 1; want.set(m.el, { pos: ltime % d, video: true, mute: sc.media.mute !== false }); } };
    addVideo(project.scenes[i], lt);
    if (i > 0 && lt < 0.6) addVideo(project.scenes[i - 1], (project.scenes[i - 1].duration || 5) + lt);
    const au = project.scenes[i].content?.audio;
    if (au?.items?.length && !project.scenes[i].muteRecitation) {
      let off = lt - AUDIO_DELAY;
      if (off >= 0) for (const it of au.items) { if (off < it.dur) { want.set(audioEl(it.url), { pos: off }); break; } off -= it.dur; }
    }
  }
  if (project.extraAudio) { const m = media.get(project.extraAudio); if (m?.el && m.ready && time < (m.dur || 1e9)) { want.set(m.el, { pos: time }); if (m.el._gain) m.el._gain.gain.value = project.extraVol; else m.el.volume = project.extraVol; } }

  const all = new Set([...audioEls.values()]);
  for (const m of media.values()) if (m.el && (m.kind === 'video' || m.kind === 'audio')) all.add(m.el);
  for (const e of all) {
    const w = want.get(e);
    if (!w || !isPlaying) { if (!e.paused) e.pause(); if (w && w.video && Math.abs(e.currentTime - w.pos) > 0.05) { try { e.currentTime = w.pos; } catch { } } continue; }
    if (w.video) e.muted = w.mute;
    if (e.paused) { try { e.currentTime = w.pos; } catch { } e.play().catch(() => { }); }
    else if (Math.abs(e.currentTime - w.pos) > (w.video ? 0.6 : 0.45)) { try { e.currentTime = w.pos; } catch { } }
  }
}

// ================= الرسم والتشغيل =================
let drawReq = 0;
function requestDraw() { if (drawReq || playing) return; drawReq = requestAnimationFrame(() => { drawReq = 0; draw(); }); }
function draw() { if (exporting) return; renderFrame(vctx, project, t, env); updateTime(); }
function setCanvasSize() {
  const f = FORMATS[project.format] || FORMATS['9:16'];
  if (view.width !== f.w || view.height !== f.h) { view.width = f.w; view.height = f.h; clearLayoutCache(); }
  fitCanvas();
}
function fitCanvas() {
  const wrap = $('#cwrap'); const W = wrap.clientWidth, H = wrap.clientHeight; if (!W || !H) return;
  const ar = view.width / view.height; let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
  view.style.width = w + 'px'; view.style.height = h + 'px';
  const s = $('#safe'); Object.assign(s.style, { width: w + 'px', height: h + 'px' });
  s.classList.toggle('on', $('#safeT').checked && project.format === '9:16');
}
new ResizeObserver(fitCanvas).observe($('#cwrap'));

function play() {
  if (!project.scenes.length) return toast('أضف مشهداً أولاً');
  initAudio();
  if (t >= totalDuration(project) - 0.05) t = 0;
  playing = true; startNow = performance.now(); startT = t;
  $('#playBtn').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'; $('#playBtn').setAttribute('aria-label', 'إيقاف مؤقت');
  ensureSceneMedia();
  loop();
}
function pause() {
  playing = false; syncMedia(t, false);
  $('#playBtn').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>'; $('#playBtn').setAttribute('aria-label', 'تشغيل');
  requestDraw();
}
function loop() {
  if (!playing || exporting) return;
  const T = totalDuration(project);
  t = startT + (performance.now() - startNow) / 1000;
  if (t >= T) { t = T; renderFrame(vctx, project, Math.max(0, T - 0.001), env); pause(); return; }
  syncMedia(t, true);
  renderFrame(vctx, project, t, env);
  updateTime();
  const { i } = sceneAt(project, t); if (i !== selected) { selected = i; markSelected(); }
  requestAnimationFrame(loop);
}
function seek(time) { t = Math.max(0, Math.min(totalDuration(project), time)); if (playing) { startNow = performance.now(); startT = t; } else { syncMedia(t, false); requestDraw(); } }
function updateTime() {
  const T = totalDuration(project);
  $('#time').textContent = fmtT(t) + ' / ' + fmtT(T);
  const sc = $('#scrub'); sc.max = Math.max(0.01, T); if (document.activeElement !== sc) sc.value = t;
}
function updateTransport() { updateTime(); }
$('#playBtn').onclick = () => playing ? pause() : play();
$('#scrub').oninput = (e) => { seek(+e.target.value); const { i } = sceneAt(project, t); if (i !== selected) { selected = i; markSelected(); renderSceneForm(); } };
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); playing ? pause() : play(); } });

// ================= المشاهد =================
function addScene(content, opts = {}) {
  const sc = { id: uid(), duration: opts.duration || suggestDuration(content), media: { ref: opts.mediaRef || null, fit: 'cover' }, content };
  if (!sc.media.ref) {
    // أعد استخدام وسائط المشهد السابق إن وجدت، وإلا اترك الخلفية الافتراضية للقالب
    const prev = project.scenes[project.scenes.length - 1];
    if (prev?.media?.ref) sc.media = { ...prev.media };
  }
  project.scenes.push(sc);
  selected = project.scenes.length - 1;
  renderTimeline(); renderSceneForm();
  seek(sceneStart(selected) + 0.01);
  touch();
  return sc;
}
const sceneStart = (i) => project.scenes.slice(0, i).reduce((s, x) => s + x.duration, 0);
function selectScene(i) { selected = i; markSelected(); renderSceneForm(); seek(sceneStart(i) + Math.min(2.5, project.scenes[i].duration * 0.6)); }
function markSelected() { $$('.clip').forEach((c, i) => c.classList.toggle('sel', i === selected)); }

function renderTimeline() {
  const tl = $('#timeline'); tl.replaceChildren();
  if (!project.scenes.length) tl.append(el('div', { class: 'tl-empty', text: 'لا توجد مشاهد بعد — اختر آية أو حديثاً أو قولاً لإضافته هنا.' }));
  const f = FORMATS[project.format];
  project.scenes.forEach((sc, i) => {
    const cv = el('canvas', { width: 108, height: Math.round(108 * f.h / f.w) });
    const badge = { ayah: 'آية', hadith: 'حديث', quote: 'قول', text: 'نص' }[sc.content?.type] || 'مشهد';
    const c = el('div', { class: 'clip' + (i === selected ? ' sel' : ''), draggable: 'true', role: 'button', tabindex: '0', 'aria-label': `المشهد ${i + 1}`, 'data-i': i,
      onclick: () => selectScene(i), onkeydown: (e) => { if (e.key === 'Enter') selectScene(i); },
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(i)); c.classList.add('dragging'); },
      ondragend: () => c.classList.remove('dragging'),
      ondragover: (e) => e.preventDefault(),
      ondrop: (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); if (isNaN(from) || from === i) return; const [s] = project.scenes.splice(from, 1); project.scenes.splice(i, 0, s); selected = i; renderTimeline(); renderSceneForm(); touch(); },
    }, cv, el('span', { class: 'badge', text: `${i + 1} • ${badge}` }), el('div', { class: 'meta' }, el('span', { text: sc.duration.toFixed(1) + 'ث' }), sc.content?.audio ? el('span', { text: '🔊' }) : ''));
    sc._thumb = cv;
    tl.append(c);
  });
  tl.append(el('button', { class: 'add-clip', onclick: () => switchTab('quran') }, el('span', { style: { fontSize: '22px' }, text: '+' }), 'إضافة'));
  scheduleThumbs();
}
let thumbT;
function scheduleThumbs() { clearTimeout(thumbT); thumbT = setTimeout(drawThumbs, 250); }
function drawThumbs() {
  for (const sc of project.scenes) {
    if (!sc._thumb) continue;
    const c = sc._thumb.getContext('2d');
    renderFrame(c, { style: project.style, scenes: [sc] }, Math.min(sc.duration - 0.1, 3.2), env);
  }
}

// ================= لوحة المشهد =================
const sceneFormEl = el('div');
function placeSceneForm() {
  const wide = matchMedia('(min-width: 1181px)').matches;
  (wide ? $('#sceneForm') : $('#sceneFormM')).append(sceneFormEl);
  $$('#rail [data-tab="scene"]').forEach(b => b.style.display = wide ? 'none' : '');
}
matchMedia('(min-width: 1181px)').addEventListener('change', placeSceneForm);

function seg(options, value, onChange, { inherit } = {}) {
  const wrap = el('div', { class: 'seg', role: 'group' });
  const opts = inherit ? [['', 'حسب القالب'], ...options] : options;
  for (const [v, label] of opts) {
    wrap.append(el('button', { type: 'button', 'aria-pressed': String((value ?? '') === v), onclick: () => { $$('button', wrap).forEach(b => b.setAttribute('aria-pressed', 'false')); wrap.children[opts.findIndex(o => o[0] === v)].setAttribute('aria-pressed', 'true'); onChange(v); } }, label));
  }
  return wrap;
}
function sw(label, checked, onChange) {
  const inp = el('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) }); inp.checked = !!checked;
  return el('label', { class: 'switch' }, el('span', { text: label }), inp);
}
function field(label, control) { return el('div', { class: 'field' }, el('span', { class: 'lbl', text: label }), control); }
function range(min, max, step, value, onInput) { const r = el('input', { type: 'range', min, max, step, oninput: (e) => onInput(+e.target.value) }); r.value = value; return r; }

const ANIMS = [['fade', 'ظهور'], ['words', 'كلمة بكلمة'], ['typewriter', 'كتابة'], ['highlight', 'إبراز مع التلاوة'], ['rise', 'سطر بسطر'], ['zoom', 'تكبير'], ['blur', 'ضبابي']];
const MOTIONS = [['kenburns', 'كين بيرنز'], ['zoomin', 'تقريب'], ['zoomout', 'تبعيد'], ['panleft', 'تحريك ←'], ['panright', 'تحريك →'], ['none', 'ثابت']];
const TRANS = [['fade', 'تلاشي'], ['slide', 'انزلاق'], ['zoom', 'تكبير'], ['blur', 'ضبابي'], ['none', 'قطع']];

function renderSceneForm() {
  sceneFormEl.replaceChildren();
  const sc = project.scenes[selected];
  if (!sc) { sceneFormEl.append(el('h2', { text: 'المشهد' }), el('p', { class: 'hint', text: 'اختر مشهداً من الشريط الزمني لتعديله.' })); return; }
  const n = project.scenes.length;
  const head = el('div', { class: 'row', style: { marginBottom: '10px' } },
    el('h2', { style: { margin: 0 }, text: `المشهد ${selected + 1} من ${n}` }),
    el('div', { class: 'row', style: { flex: 'none', gap: '4px' } },
      el('button', { class: 'btn icon sm ghost', title: 'تقديم', 'aria-label': 'نقل للأمام', disabled: selected === 0, onclick: () => moveScene(-1) }, '→'),
      el('button', { class: 'btn icon sm ghost', title: 'تأخير', 'aria-label': 'نقل للخلف', disabled: selected === n - 1, onclick: () => moveScene(1) }, '←'),
      el('button', { class: 'btn icon sm ghost', title: 'تكرار', 'aria-label': 'تكرار المشهد', onclick: dupScene }, '⧉'),
      el('button', { class: 'btn icon sm ghost danger', title: 'حذف', 'aria-label': 'حذف المشهد', onclick: delScene }, '🗑')));
  sceneFormEl.append(head);

  const c = sc.content || {};
  // المحتوى
  const g1 = el('div', { class: 'group' }, el('h3', { text: { ayah: 'آية قرآنية', hadith: 'حديث نبوي', quote: 'قول مأثور', text: 'نص حر' }[c.type] || 'المحتوى' }));
  if (c.type === 'text') {
    const ta = el('textarea', { oninput: (e) => { c.ar = e.target.value; touch(); } }); ta.value = c.ar || '';
    const tr = el('textarea', { style: { minHeight: '60px' }, oninput: (e) => { c.tr = e.target.value; touch(); } }); tr.value = c.tr || '';
    const rf = el('input', { type: 'text', oninput: (e) => { c.ref = e.target.value; touch(); } }); rf.value = c.ref || '';
    g1.append(field('النص', ta), field('النص الثانوي', tr), field('المرجع', rf));
  } else {
    g1.append(el('div', { class: 'item', style: { padding: '8px 10px' } }, el('div', { class: c.type === 'ayah' ? 'ar' : 'ar n', text: c.ar }), c.tr ? el('div', { class: 'tr', dir: isRtl(c.trLang) ? 'rtl' : 'ltr', text: c.tr }) : '', el('div', { class: 'src', text: c.ref })));
    g1.append(el('p', { class: 'hint', style: { margin: '6px 0' }, text: 'النصوص المنقولة من المصادر مقفلة للحفاظ على دقتها.' }));
  }
  if (c.tr) g1.append(sw('إظهار الترجمة', sc.showTr ?? project.style.showTr, (v) => { sc.showTr = v; touch(); }));
  if (c.tafsir) g1.append(sw('إظهار ' + (c.tafsirLabel || 'التفسير'), sc.showTafsir ?? project.style.showTafsir, (v) => { sc.showTafsir = v; touch(); }));
  if (c.audio) g1.append(sw('تشغيل التلاوة', !sc.muteRecitation, (v) => { sc.muteRecitation = !v; touch({ noThumbs: true }); }));
  sceneFormEl.append(g1);

  // الخلفية
  const m = media.get(sc.media?.ref);
  const gen = GEN_BACKGROUNDS.find(g => g.id === (sc.media?.ref || project.style.defaultBg));
  const g2 = el('div', { class: 'group' }, el('h3', { text: 'الخلفية' }),
    el('p', { class: 'hint', style: { margin: '0 0 8px' }, text: m ? `${m.kind === 'video' ? 'فيديو' : 'صورة'}: ${m.name}` : `خلفية جاهزة: ${gen?.label || ''}` }),
    el('div', { class: 'row' }, el('button', { class: 'btn sm', onclick: () => { switchTab('media'); toast('اضغط على أي صورة أو فيديو لتعيينه لهذا المشهد'); } }, 'تغيير الخلفية'),
      sc.media?.ref ? el('button', { class: 'btn sm ghost', onclick: () => { sc.media.ref = null; renderSceneForm(); touch(); } }, 'خلفية القالب') : ''));
  if (m) {
    g2.append(field('الملاءمة', seg([['cover', 'ملء الشاشة'], ['contain', 'كاملة مع ضبابية']], sc.media.fit || 'cover', (v) => { sc.media.fit = v; touch(); })));
    g2.append(field('حركة الخلفية', seg(MOTIONS, sc.media.motion, (v) => { sc.media.motion = v || undefined; touch(); }, { inherit: true })));
    if (m.kind === 'video') g2.append(sw('كتم صوت الفيديو', sc.media.mute !== false, (v) => { sc.media.mute = v; touch({ noThumbs: true }); }));
  }
  sceneFormEl.append(g2);

  // التوقيت والحركة
  const dur = el('input', { type: 'number', min: '1', max: '120', step: '0.5', inputmode: 'decimal', onchange: (e) => { sc.duration = Math.max(1, Math.min(120, +e.target.value || 5)); renderTimeline(); touch(); } }); dur.value = sc.duration;
  const g3 = el('div', { class: 'group' }, el('h3', { text: 'التوقيت والحركة' }),
    field('المدة (ثوانٍ)', el('div', { class: 'row' }, dur, c.audio ? el('button', { class: 'btn sm', style: { flex: 'none' }, onclick: () => { sc.duration = suggestDuration(c); renderSceneForm(); renderTimeline(); touch(); } }, 'على قدر التلاوة') : '')),
    field('حركة النص', seg(ANIMS, sc.textAnim, (v) => { sc.textAnim = v || undefined; touch(); }, { inherit: true })),
    field('الانتقال إلى هذا المشهد', seg(TRANS, sc.transition, (v) => { sc.transition = v || undefined; touch(); }, { inherit: true })));
  sceneFormEl.append(g3);
}
function moveScene(d) { const j = selected + d; if (j < 0 || j >= project.scenes.length) return; const [s] = project.scenes.splice(selected, 1); project.scenes.splice(j, 0, s); selected = j; renderTimeline(); renderSceneForm(); touch(); }
function dupScene() { const s = project.scenes[selected]; const c = JSON.parse(JSON.stringify({ ...s, _thumb: undefined })); c.id = uid(); project.scenes.splice(selected + 1, 0, c); selected++; renderTimeline(); renderSceneForm(); touch(); }
function delScene() { if (!confirm('حذف هذا المشهد؟')) return; project.scenes.splice(selected, 1); selected = Math.max(0, selected - 1); renderTimeline(); renderSceneForm(); seek(Math.min(t, totalDuration(project))); touch(); }

// ================= التبويبات =================
function buildRail() {
  const rail = $('#rail');
  for (const [id, label] of TABS) rail.append(el('button', { role: 'tab', 'data-tab': id, 'aria-selected': 'false', onclick: () => switchTab(id) }, el('span', { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg>` }), label));
}
const tabInit = {};
function switchTab(id) {
  $$('#rail button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  $$('#panel section').forEach(s => s.classList.toggle('on', s.dataset.tab === id));
  if (!tabInit[id]) { tabInit[id] = true; ({ quran: initQuran, hadith: initHadith, salaf: initSalaf, projects: refreshDriveLists })[id]?.(); }
  LS.set('rs.tab', id);
  if (matchMedia('(max-width: 860px)').matches) $('#rail').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ================= القوالب =================
function renderTemplates() {
  const g = $('#tplGrid'); g.replaceChildren();
  for (const tp of TEMPLATES) {
    const cv = el('canvas', { width: 216, height: 336 });
    const b = el('button', { class: 'tpl', 'aria-pressed': String(project.template === tp.id), onclick: () => applyTemplate(tp.id) }, cv, el('div', {}, el('b', { text: tp.name }), el('small', { text: tp.desc })));
    g.append(b);
    renderFrame(cv.getContext('2d'), { style: styleFromTemplate(tp.id), scenes: [{ id: 'tp' + tp.id, duration: 6, media: {}, content: SAMPLE_CONTENT }] }, 4, env);
  }
}
function applyTemplate(id, style) {
  const keep = { handle: project.style.handle, showSource: project.style.showSource };
  project.template = id; project.style = { ...BASE_STYLE, ...(style || styleFromTemplate(id)), ...keep };
  $$('#tplGrid .tpl').forEach((b, i) => b.setAttribute('aria-pressed', String(TEMPLATES[i].id === id)));
  renderStyleForm(); renderSceneForm(); touch();
  toast('تم تطبيق القالب');
}

// ================= التنسيق العام =================
function renderStyleForm() {
  const s = project.style, f = $('#styleForm'); f.replaceChildren();
  const set = (k) => (v) => { s[k] = v; touch(); };
  const color = (k) => { const i = el('input', { type: 'color', oninput: (e) => set(k)(e.target.value) }); i.value = s[k]; return i; };
  const fontSel = el('select', { onchange: (e) => { set('fontAr')(e.target.value); loadFonts().then(() => { clearLayoutCache(); touch(); }); } }, FONTS_AR.map(x => el('option', { value: x.id, text: x.label })));
  fontSel.value = s.fontAr;
  const handle = el('input', { type: 'text', dir: 'ltr', placeholder: '@account', oninput: (e) => set('handle')(e.target.value) }); handle.value = s.handle || '';
  f.append(
    el('div', { class: 'group' }, el('h3', { text: 'الخط والألوان' }),
      field('الخط العربي', fontSel),
      field('حجم النص العربي', range(40, 120, 1, s.arSize, (v) => { s.arSize = v; clearLayoutCache(); touch(); })),
      field('حجم الترجمة', range(22, 64, 1, s.trSize, (v) => { s.trSize = v; clearLayoutCache(); touch(); })),
      field('حجم التفسير / الشرح', range(20, 56, 1, s.tafsirSize, (v) => { s.tafsirSize = v; clearLayoutCache(); touch(); })),
      el('div', { class: 'row' }, field('النص', color('textColor')), field('الذهبي', color('accent')), field('الترجمة', color('trColor')))),
    el('div', { class: 'group' }, el('h3', { text: 'التخطيط' }),
      field('موضع النص', seg([['top', 'أعلى'], ['upper', 'فوق الوسط'], ['center', 'الوسط'], ['lower', 'أسفل']], s.vpos, (v) => { s.vpos = v; clearLayoutCache(); touch(); })),
      field('خلفية النص', seg([['none', 'بدون'], ['glass', 'زجاجي'], ['solid', 'معتم'], ['card', 'بطاقة'], ['ribbon', 'شريط']], s.box, (v) => { s.box = v; clearLayoutCache(); touch(); })),
      field('شفافية خلفية النص', range(0.1, 0.9, 0.05, s.boxOpacity, set('boxOpacity'))),
      field('طبقة التعتيم', seg([['none', 'بدون'], ['dark', 'داكن'], ['gradient', 'متدرج'], ['vignette', 'إطار ظلي'], ['tint', 'لون']], s.overlay, set('overlay'))),
      field('قوة التعتيم', range(0, 1, 0.05, s.overlayOpacity, set('overlayOpacity'))),
      field('لون التعتيم', color('tint'))),
    el('div', { class: 'group' }, el('h3', { text: 'الموشن جرافيك' }),
      field('حركة النص', seg(ANIMS, s.textAnim, set('textAnim'))),
      field('حركة الخلفية', seg(MOTIONS, s.bgMotion, set('bgMotion'))),
      field('الانتقال بين المشاهد', seg(TRANS, s.transition, set('transition'))),
      field('مؤثرات', seg([['none', 'بدون'], ['dust', 'غبار نور'], ['stars', 'نجوم'], ['snow', 'تساقط'], ['bokeh', 'فقاعات ضوء']], s.particles, set('particles'))),
      field('إطار', seg([['none', 'بدون'], ['thin', 'رفيع'], ['double', 'مزدوج'], ['corners', 'أركان'], ['arch', 'محراب']], s.frame, set('frame'))),
      field('زخرفة الخلفية', seg([['none', 'بدون'], ['star8', 'نجمة ثمانية']], s.pattern, set('pattern'))),
      sw('أشعة ضوء', s.rays, set('rays'))),
    el('div', { class: 'group' }, el('h3', { text: 'العناصر' }),
      sw('الترجمة', s.showTr, (v) => { s.showTr = v; clearLayoutCache(); touch(); }),
      sw('التفسير / الشرح', s.showTafsir, (v) => { s.showTafsir = v; clearLayoutCache(); touch(); }),
      sw('المرجع (اسم السورة / التخريج)', s.showRef, (v) => { s.showRef = v; clearLayoutCache(); touch(); }),
      sw('ظل النص', s.shadow, set('shadow')),
      sw('شريط التقدم', s.progress, set('progress')),
      field('اسم الحساب (علامة مائية)', handle)),
  );
}

// ================= القرآن =================
let qTrList = [];
function initQuran() {
  const ss = $('#qSura');
  SURAH_NAMES.forEach((n, i) => ss.append(el('option', { value: i + 1, text: `${toArDigits(i + 1)}. ${n} (${toArDigits(AYAH_COUNTS[i])})` })));
  ss.onchange = () => { const c = AYAH_COUNTS[ss.value - 1]; $('#qFrom').max = c; $('#qTo').max = c; $('#qFrom').value = 1; $('#qTo').value = Math.min(c, 5); };
  ss.onchange();
  const clampA = () => { const c = AYAH_COUNTS[ss.value - 1]; let a = Math.max(1, Math.min(c, +$('#qFrom').value || 1)); let b = Math.max(a, Math.min(c, +$('#qTo').value || a)); $('#qFrom').value = a; $('#qTo').value = b; };
  $('#qFrom').onchange = clampA; $('#qTo').onchange = clampA;
  const chips = $('#ayaChips');
  SUGGESTED_AYAT.forEach(x => chips.append(el('button', { class: 'chip', onclick: () => { ss.value = x.s; ss.onchange(); $('#qFrom').value = x.a; $('#qTo').value = x.b; fetchAyat(); } }, x.t)));
  SRC.TAFSIRS.forEach(x => $('#qTaf').append(el('option', { value: x.key, text: x.label })));
  RECITERS.forEach(x => $('#qRec').append(el('option', { value: x.id, text: x.label })));
  $('#qRec').value = LS.get('rs.rec', 'Alafasy_128kbps'); $('#qRec').onchange = () => LS.set('rs.rec', $('#qRec').value);
  $('#qTaf').value = LS.get('rs.taf', 'arabic_moyassar'); $('#qTaf').onchange = () => LS.set('rs.taf', $('#qTaf').value);
  $('#qFetch').onclick = fetchAyat;
  const trSel = $('#qTr');
  trSel.append(el('option', { value: '', text: 'جارٍ تحميل الترجمات…', disabled: true }));
  SRC.quranTranslations().then(list => {
    qTrList = list; trSel.lastChild.remove();
    const groups = {};
    list.forEach(x => (groups[x.lang] ||= []).push(x));
    for (const [lang, arr] of Object.entries(groups)) {
      const og = el('optgroup', { label: SRC.langName(lang) });
      arr.forEach(x => og.append(el('option', { value: x.key, text: `${SRC.langName(lang)} — ${x.title}` })));
      trSel.append(og);
    }
    trSel.value = LS.get('rs.tr', 'english_saheeh');
  }).catch(e => { trSel.lastChild.textContent = 'تعذر تحميل قائمة الترجمات'; });
  trSel.onchange = () => LS.set('rs.tr', trSel.value);
}

async function fetchAyat() {
  const s = +$('#qSura').value, a = +$('#qFrom').value, b = +$('#qTo').value;
  const trKey = $('#qTr').value, tafKey = $('#qTaf').value, rec = $('#qRec').value;
  const res = $('#qRes'); res.replaceChildren(el('div', { class: 'loading', text: 'جارٍ الجلب من موسوعة القرآن الكريم…' }));
  try {
    const [base, taf] = await Promise.all([SRC.suraText(trKey || tafKey || 'arabic_moyassar', s), tafKey ? SRC.suraText(tafKey, s) : null]);
    const tr = qTrList.find(x => x.key === trKey);
    const rows = base.filter(x => x.aya >= a && x.aya <= b).map(x => ({
      sura: s, aya: x.aya, ar: x.ar, tr: trKey ? x.tr : '', trLang: tr?.lang || 'en', trTitle: tr?.title || '',
      tafsir: taf ? (taf.find(y => y.aya === x.aya)?.tr || '') : '',
    }));
    res.replaceChildren();
    const actions = el('div', { class: 'row', style: { flexWrap: 'wrap', position: 'sticky', top: '0', background: 'var(--panel)', padding: '6px 0', zIndex: 2 } },
      el('button', { class: 'btn gold sm', onclick: () => addAyat(rows.filter((_, i) => checks[i].checked), false, { rec, tafKey }) }, 'كل آية في مشهد'),
      el('button', { class: 'btn sm', onclick: () => addAyat(rows.filter((_, i) => checks[i].checked), true, { rec, tafKey }) }, 'دمج في مشهد واحد'));
    res.append(actions);
    const checks = [];
    rows.forEach(r => {
      const ck = el('input', { type: 'checkbox', checked: true }); checks.push(ck);
      res.append(el('div', { class: 'item' }, el('label', { class: 'ck' }, ck, el('div', {},
        el('div', { class: 'ar', text: `${r.ar} ۝${toArDigits(r.aya)}` }),
        r.tr ? el('div', { class: 'tr', dir: isRtl(r.trLang) ? 'rtl' : 'ltr', text: r.tr }) : '',
        r.tafsir ? el('details', {}, el('summary', { class: 'src', text: 'التفسير' }), el('div', { class: 'tr', text: r.tafsir })) : '',
        el('div', { class: 'src', text: `سورة ${SURAH_NAMES[s - 1]} • الآية ${toArDigits(r.aya)}` })))));
    });
  } catch (e) { res.replaceChildren(el('div', { class: 'err', text: e.message + ' — تأكد من اتصال الإنترنت.' })); }
}
async function addAyat(rows, merge, { rec, tafKey }) {
  if (!rows.length) return toast('حدد آية واحدة على الأقل');
  const s = rows[0].sura, name = SURAH_NAMES[s - 1];
  const trTitle = rows[0].trTitle;
  const source = 'مصحف المدينة النبوية — مجمع الملك فهد' + (trTitle && rows[0].tr ? ' • ' + trTitle : '');
  const tafLabel = tafKey === 'arabic_mokhtasar' ? 'المختصر في التفسير' : 'التفسير الميسر';
  const groups = merge ? [rows] : rows.map(r => [r]);
  toast(rec ? 'جارٍ تجهيز التلاوة…' : 'تمت الإضافة');
  for (const g of groups) {
    const first = g[0].aya, last = g[g.length - 1].aya;
    const content = {
      type: 'ayah', meta: { sura: s, from: first, to: last },
      ar: g.map(r => `${r.ar} ۝${toArDigits(r.aya)}`).join(' '),
      tr: g.map(r => r.tr).filter(Boolean).join(' '), trLang: g[0].trLang,
      tafsir: g.map(r => r.tafsir).filter(Boolean).join(' '), tafsirLabel: tafLabel,
      ref: `سورة ${name} • ${first === last ? 'الآية ' + toArDigits(first) : 'الآيات ' + toArDigits(first) + '–' + toArDigits(last)}`,
      source,
    };
    if (rec) {
      const items = g.map(r => ({ url: SRC.recitationUrl(rec, s, r.aya), dur: 0 }));
      const durs = await Promise.all(items.map(it => probeDuration(it.url)));
      items.forEach((it, i) => it.dur = durs[i] || 6);
      content.audio = { reciter: rec, items, dur: items.reduce((x, y) => x + y.dur, 0) };
    }
    addScene(content);
  }
  toast(`أُضيف ${groups.length} ${groups.length > 1 ? 'مشاهد' : 'مشهد'}`);
}

// ================= الحديث =================
let hCats = null, hPath = [], hLangs = [];
async function initHadith() {
  const ls = $('#hLang');
  try {
    hLangs = await SRC.hadithLanguages();
    hLangs.filter(l => l.code !== 'ar').forEach(l => ls.append(el('option', { value: l.code, text: l.native })));
    ls.value = LS.get('rs.hlang', 'en');
  } catch { }
  ls.onchange = () => { LS.set('rs.hlang', ls.value); };
  showHadithCats();
}
async function showHadithCats() {
  const res = $('#hRes');
  res.replaceChildren(el('div', { class: 'loading', text: 'جارٍ تحميل الأقسام…' }));
  try {
    if (!hCats) hCats = await SRC.hadithCategories('ar');
  } catch (e) { res.replaceChildren(el('div', { class: 'err', text: e.message })); return; }
  const parent = hPath.length ? hPath[hPath.length - 1].id : null;
  const kids = hCats.filter(c => String(c.parent_id ?? '') === String(parent ?? ''));
  renderCrumbs();
  res.replaceChildren();
  kids.forEach(c => res.append(el('button', { class: 'list-btn', onclick: () => { hPath.push(c); showHadithCats(); } }, c.title, el('small', { text: `${toArDigits(c.hadeeths_count)} حديث` }))));
  if (parent) { res.append(el('div', { class: 'lbl', style: { margin: '10px 0 6px' }, text: 'الأحاديث' })); loadHadithList(parent, 1, res); }
}
function renderCrumbs() {
  const cr = $('#hCrumbs'); cr.replaceChildren(el('button', { onclick: () => { hPath = []; showHadithCats(); } }, 'الأقسام'));
  hPath.forEach((c, i) => cr.append(' › ', el('button', { onclick: () => { hPath = hPath.slice(0, i + 1); showHadithCats(); } }, c.title)));
}
async function loadHadithList(cat, page, res) {
  const ld = el('div', { class: 'loading', text: 'جارٍ تحميل الأحاديث…' }); res.append(ld);
  try {
    const r = await SRC.hadithList(cat, page, 'ar');
    ld.remove();
    const lang = $('#hLang').value;
    (r.data || []).forEach(h => {
      const has = !lang || (h.translations || []).includes(lang);
      res.append(el('button', { class: 'list-btn', onclick: (e) => openHadith(h.id, e.currentTarget) }, h.title, lang && !has ? el('small', { text: 'لا تتوفر ترجمة باللغة المختارة' }) : ''));
    });
    const m = r.meta || {};
    if (+m.current_page < +m.last_page) { const more = el('button', { class: 'btn sm', style: { width: '100%' }, onclick: () => { more.remove(); loadHadithList(cat, page + 1, res); } }, 'المزيد'); res.append(more); }
  } catch (e) { ld.replaceWith(el('div', { class: 'err', text: e.message })); }
}
async function openHadith(id, anchor) {
  const box = el('div', { class: 'item' }, el('div', { class: 'loading', text: 'جارٍ جلب الحديث…' }));
  const next = anchor.nextElementSibling; if (next?.classList.contains('item')) { next.remove(); return; }
  anchor.after(box);
  try {
    const lang = $('#hLang').value;
    const ar = await SRC.hadithOne(id, 'ar');
    let tr = null;
    if (lang && (ar.translations || []).includes(lang)) { try { tr = await SRC.hadithOne(id, lang); } catch { } }
    const ref = [ar.attribution, ar.grade].filter(Boolean).join(' • ');
    const withExp = el('input', { type: 'checkbox' });
    box.replaceChildren(
      el('div', { class: 'ar n', text: ar.hadeeth }),
      tr ? el('div', { class: 'tr', dir: isRtl(lang) ? 'rtl' : 'ltr', text: tr.hadeeth }) : '',
      el('div', { class: 'src', text: ref }),
      el('details', {}, el('summary', { class: 'src', text: 'الشرح' }), el('div', { class: 'tr', text: ar.explanation || '' })),
      el('label', { class: 'switch', style: { fontSize: '13px' } }, el('span', { text: 'إضافة الشرح المختصر أسفل الحديث' }), withExp),
      el('div', { class: 'acts' },
        el('button', { class: 'btn gold sm', onclick: () => { addScene({ type: 'hadith', meta: { id }, ar: ar.hadeeth, tr: tr?.hadeeth || '', trLang: lang || 'en', tafsir: withExp.checked ? ar.explanation : '', tafsirLabel: 'شرح الحديث', ref, source: 'موسوعة الأحاديث النبوية المترجمة — HadeethEnc.com' }); if (withExp.checked) project.scenes[selected].showTafsir = true; toast('تمت إضافة الحديث'); } }, 'إضافة مشهد'),
        el('a', { class: 'btn sm ghost', href: `https://hadeethenc.com/ar/browse/hadith/${id}`, target: '_blank', rel: 'noopener' }, 'عرض في المصدر')));
  } catch (e) { box.replaceChildren(el('div', { class: 'err', text: e.message })); }
}

// ================= أقوال السلف =================
let sFilter = '';
function initSalaf() {
  const f = $('#sFilter');
  f.append(seg([['', 'الكل'], ['ابن القيم', 'ابن القيم'], ['ابن الجوزي', 'ابن الجوزي']], '', (v) => { sFilter = v; renderSalaf(); }));
  $('#sSearch').oninput = renderSalaf;
  renderSalaf();
}
function renderSalaf() {
  const qv = SRC.stripTashkeel($('#sSearch').value.trim());
  const res = $('#sRes'); res.replaceChildren();
  SRC.SALAF_QUOTES.filter(x => (!sFilter || x.scholar === sFilter) && (!qv || x.text.includes(qv) || x.book.includes(qv))).forEach(x => {
    res.append(el('div', { class: 'item' },
      el('div', { class: 'ar n', text: x.text }),
      el('div', { class: 'src', text: `${x.scholar} — ${x.book} (${x.ref})` }),
      el('div', { class: 'acts' },
        el('button', { class: 'btn gold sm', onclick: () => { addScene({ type: 'quote', ar: x.text, ref: `${x.scholar} — ${x.book}`, source: `${x.book}، ${x.ref}` }); toast('تمت الإضافة'); } }, 'إضافة مشهد'),
        el('a', { class: 'btn sm ghost', href: x.url, target: '_blank', rel: 'noopener' }, 'التحقق من المصدر'))));
  });
  if (!res.children.length) res.append(el('p', { class: 'hint', text: 'لا نتائج.' }));
}

// ================= نص حر =================
$('#tAdd').onclick = () => {
  const ar = $('#tAr').value.trim(); if (!ar) return toast('اكتب النص أولاً');
  addScene({ type: 'text', ar, tr: $('#tTr').value.trim(), trLang: $('#tTrLang').value, ref: $('#tRef').value.trim() });
  $('#tAr').value = ''; $('#tTr').value = ''; $('#tRef').value = '';
  toast('تمت الإضافة');
};

// ================= شبكة الوسائط =================
function renderGenGrid() {
  const g = $('#genGrid'); g.replaceChildren();
  for (const b of GEN_BACKGROUNDS) {
    const cv = el('canvas', { width: 90, height: 120 });
    g.append(el('button', { class: 'mthumb', title: b.label, onclick: () => assignMedia(b.id) }, cv, el('span', { class: 'k', text: b.label })));
    renderFrame(cv.getContext('2d'), { style: { ...project.style, overlay: 'none', particles: 'none', frame: 'none', pattern: 'none', rays: false, handle: '', progress: false }, scenes: [{ id: 'g', duration: 5, media: { ref: b.id }, content: {} }] }, 2, env);
  }
}
const CLOUD = '<svg viewBox="0 0 24 24" fill="none" stroke="#7fe0b0" stroke-width="2.4"><path d="M7 18h10a4 4 0 00.5-8A6 6 0 006 9a4.5 4.5 0 001 9z"/></svg>';
function renderMediaGrid() {
  const g = $('#mediaGrid'); if (!g) return; g.replaceChildren();
  const items = [...media.values()].filter(m => m.kind !== 'audio');
  if (!items.length) { g.append(el('p', { class: 'hint', style: { gridColumn: '1/-1' }, text: 'لا توجد وسائط بعد.' })); return; }
  const cur = project.scenes[selected]?.media?.ref;
  for (const m of items) {
    let vis;
    if (m.kind === 'image' && m.url) vis = el('img', { src: m.url, alt: '', loading: 'lazy' });
    else if (m.kind === 'video' && m.url) vis = el('video', { src: m.url, muted: true, preload: 'metadata', playsinline: true });
    else if (m.thumb) vis = el('img', { src: m.thumb, alt: '', referrerpolicy: 'no-referrer', loading: 'lazy', onerror: (e) => e.target.replaceWith(el('div', { style: { display: 'grid', placeItems: 'center', height: '100%', fontSize: '26px' }, text: m.kind === 'video' ? '🎬' : '🖼' })) });
    else vis = el('div', { style: { display: 'grid', placeItems: 'center', height: '100%', fontSize: '26px' }, text: m.kind === 'video' ? '🎬' : '🖼' });
    g.append(el('button', { class: 'mthumb' + (cur === m.id ? ' sel' : ''), 'data-mid': m.id, title: m.name, onclick: () => assignMedia(m.id) }, vis,
      el('span', { class: 'k', text: m.kind === 'video' ? 'فيديو' : 'صورة' }),
      m.driveId ? el('span', { class: 'cloud', html: CLOUD, title: 'محفوظ في درايف' }) : '',
      m.progress != null ? el('span', { class: 'bar' }, el('i', { style: { width: (m.progress * 100) + '%' } })) : ''));
  }
}
async function assignMedia(id) {
  const sc = project.scenes[selected];
  const m = media.get(id);
  if (m) await ensureLoaded(m);
  if (!sc) { project.style.defaultBg = id.startsWith('g-') ? id : project.style.defaultBg; if (!id.startsWith('g-')) toast('أضف مشهداً أولاً ثم اختر خلفيته'); touch(); return; }
  sc.media = { ...(sc.media || {}), ref: id };
  renderSceneForm(); renderMediaGrid(); touch();
  toast(`تم تعيين الخلفية للمشهد ${selected + 1}`);
}
$('#mAuto').onclick = async () => {
  const items = [...media.values()].filter(m => m.kind !== 'audio');
  if (!items.length || !project.scenes.length) return toast('تحتاج وسائط ومشاهد للتوزيع');
  project.scenes.forEach((sc, i) => sc.media = { ...(sc.media || {}), ref: items[i % items.length].id });
  await ensureSceneMedia(); renderSceneForm(); renderMediaGrid(); touch(); toast('تم توزيع الوسائط على المشاهد');
};
$('#mDevice').onclick = () => $('#mFile').click();
$('#mFile').onchange = (e) => { [...e.target.files].forEach(f => { const m = addLocalFile(f); if (project.scenes[selected] && e.target.files.length === 1) assignMedia(m.id); }); e.target.value = ''; renderMediaGrid(); };
const drop = $('#drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); [...e.dataTransfer.files].filter(f => /^(image|video)\//.test(f.type)).forEach(addLocalFile); renderMediaGrid(); };
$('#mDrive').onclick = async () => {
  if (!await requireDrive()) return;
  toast('جارٍ عرض مجلد الوسائط…');
  try { const files = await Drive.listFiles('media', ['image/', 'video/']); files.forEach(registerDriveFile); renderMediaGrid(); toast(`${files.length} ملف في مجلد الوسائط`); } catch (e) { toast(e.message); }
};
$('#mPicker').onclick = async () => {
  if (!await requireDrive()) return;
  try { const docs = await Drive.pick({ views: ['image', 'video'] }); for (const d of docs) { const m = registerDriveFile(d); ensureLoaded(m); } renderMediaGrid(); }
  catch (e) { if (e.message === 'NO_API_KEY') { toast('منتقي درايف يحتاج API Key — أضفه من الإعدادات، أو استخدم «من مجلد التطبيق»'); openSettings(); } else toast(e.message); }
};
// صوت إضافي
$('#aDevice').onclick = () => $('#aFile').click();
$('#aFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; initAudio(); const m = addLocalFile(f); project.extraAudio = m.id; renderAudioInfo(); touch({ noThumbs: true }); e.target.value = ''; };
$('#aDrive').onclick = async () => {
  if (!await requireDrive()) return;
  try {
    let docs;
    try { docs = await Drive.pick({ multiple: false, views: ['audio'] }); }
    catch (er) { if (er.message !== 'NO_API_KEY') throw er; const f = await Drive.listFiles('media', ['audio/']); if (!f.length) return toast('لا توجد ملفات صوت في مجلد الوسائط'); docs = [f[0]]; toast('تم اختيار أحدث ملف صوتي في مجلد الوسائط'); }
    if (!docs.length) return;
    initAudio(); const m = registerDriveFile(docs[0]); await ensureLoaded(m); project.extraAudio = m.id; renderAudioInfo(); touch({ noThumbs: true });
  } catch (e) { toast(e.message); }
};
$('#aClear').onclick = () => { project.extraAudio = null; renderAudioInfo(); touch({ noThumbs: true }); };
$('#aVol').oninput = (e) => { project.extraVol = +e.target.value; touch({ noThumbs: true }); };
function renderAudioInfo() { const m = media.get(project.extraAudio); $('#aInfo').textContent = m ? `🎙 ${m.name}${m.dur ? ' — ' + fmtT(m.dur) : ''}` : 'لا يوجد صوت إضافي.'; $('#aVol').value = project.extraVol ?? 0.6; }

// ================= درايف =================
function loadCfg() {
  const env = window.RS_CONFIG || {}, saved = LS.get('rs.cfg', {});
  const c = { clientId: saved.clientId || env.googleClientId || '', apiKey: saved.apiKey || env.googleApiKey || '', appId: saved.appId || env.googleAppId || '' };
  Drive.configure(c); return c;
}
function openSettings() {
  const c = Drive.getConfig();
  $('#cfgClient').value = c.clientId || ''; $('#cfgKey').value = c.apiKey || ''; $('#cfgApp').value = c.appId || '';
  $('#originCode').textContent = location.origin;
  $('#dlgSettings').showModal();
}
$('#cfgSave').onclick = async () => {
  const c = { clientId: $('#cfgClient').value.trim(), apiKey: $('#cfgKey').value.trim(), appId: $('#cfgApp').value.trim() };
  LS.set('rs.cfg', c); Drive.configure(c); $('#dlgSettings').close();
  if (c.clientId) connectDrive();
};
$('#openSettings').onclick = openSettings;
async function connectDrive() {
  try { await Drive.connect('consent'); toast('تم الاتصال بـ Google Drive ✓'); await Drive.folder('media'); refreshDriveLists(); uploadPending(); }
  catch (e) { if (e.message === 'NO_CLIENT_ID') openSettings(); else toast('تعذر الاتصال: ' + e.message, 4000); }
}
async function requireDrive() {
  if (Drive.isConnected()) return true;
  if (!Drive.getConfig().clientId) { openSettings(); return false; }
  await connectDrive(); return Drive.isConnected();
}
function uploadPending() { if (!$('#autoUp').checked) return; for (const m of media.values()) if (!m.driveId && m.blob) uploadMedia(m); }
$('#driveBtn').onclick = () => { if (Drive.isConnected()) { if (confirm('قطع الاتصال بـ Google Drive؟')) Drive.disconnect(); } else requireDrive(); };
Drive.onDriveChange((on) => { $('#driveBtn').classList.toggle('on', on); $('#driveLbl').textContent = on ? 'درايف متصل' : 'ربط درايف'; });

async function refreshDriveLists() {
  const pl = $('#projList'), vl = $('#vidList'), tl = $('#myTpls');
  if (!Drive.isConnected()) { [pl, tl].forEach(x => x.replaceChildren(el('p', { class: 'hint', style: { margin: 0 }, text: 'اربط درايف لعرض ملفاتك.' }))); vl.replaceChildren(); return; }
  [pl, vl, tl].forEach(x => x.replaceChildren(el('div', { class: 'loading', text: 'جارٍ التحميل…' })));
  try {
    const [projs, vids, tpls] = await Promise.all([Drive.listFiles('projects'), Drive.listFiles('videos'), Drive.listFiles('templates')]);
    pl.replaceChildren(...(projs.length ? projs.map(f => el('div', { class: 'item row' }, el('div', {}, el('b', { text: f.name.replace(/\.reel\.json$/, '') }), el('div', { class: 'hint', style: { margin: 0 }, text: new Date(f.modifiedTime).toLocaleString('ar-SA') })),
      el('button', { class: 'btn sm', style: { flex: 'none' }, onclick: () => openProject(f.id) }, 'فتح'),
      el('button', { class: 'btn sm ghost danger', style: { flex: 'none' }, 'aria-label': 'حذف', onclick: async () => { if (confirm('نقل المشروع إلى سلة درايف؟')) { await Drive.trash(f.id); refreshDriveLists(); } } }, '🗑'))) : [el('p', { class: 'hint', style: { margin: 0 }, text: 'لا مشاريع محفوظة بعد.' })]));
    vl.replaceChildren(...(vids.length ? vids.slice(0, 20).map(f => el('a', { class: 'list-btn', href: f.webViewLink, target: '_blank', rel: 'noopener' }, f.name, el('small', { text: `${(+f.size / 1048576 || 0).toFixed(1)} MB • ${new Date(f.modifiedTime).toLocaleDateString('ar-SA')}` }))) : [el('p', { class: 'hint', style: { margin: 0 }, text: 'لا فيديوهات بعد.' })]));
    tl.replaceChildren(...(tpls.length ? tpls.map(f => el('button', { class: 'list-btn', onclick: async () => { const s = await Drive.loadJson(f.id); applyTemplate('custom', s.style || s); } }, f.name.replace(/\.tpl\.json$/, ''))) : [el('p', { class: 'hint', style: { margin: 0 }, text: 'لا قوالب خاصة بعد.' })]));
  } catch (e) { pl.replaceChildren(el('div', { class: 'err', text: e.message })); }
}
$('#refreshProj').onclick = refreshDriveLists;
$('#newProj').onclick = () => { if (project.scenes.length && !confirm('بدء مشروع جديد؟ (احفظ الحالي أولاً)')) return; pause(); project = newProject(project.template); selected = 0; t = 0; syncUI(); touch(); };

async function saveProject() {
  if (!await requireDrive()) return;
  project.name = $('#projName').value.trim() || 'ريل';
  const btn = $('#saveBtn'); btn.disabled = true;
  try {
    // ارفع أي وسائط مستخدمة لم تُرفع بعد
    const used = new Set(project.scenes.map(s => s.media?.ref)); if (project.extraAudio) used.add(project.extraAudio);
    for (const id of used) { const m = media.get(id); if (m && !m.driveId && m.blob) await uploadMedia(m); }
    const data = serializeProject();
    const r = await Drive.saveJson('projects', project.name + '.reel.json', data, project.driveFileId);
    project.driveFileId = r.id; touch({ noThumbs: true });
    toast('تم حفظ المشروع في درايف ✓');
    if (tabInit.projects) refreshDriveLists();
  } catch (e) {
    if (project.driveFileId && /not ?found|404/i.test(e.message)) { project.driveFileId = null; return saveProject(); }
    toast('فشل الحفظ: ' + e.message, 4000);
  } finally { btn.disabled = false; }
}
$('#saveBtn').onclick = saveProject;
async function openProject(fileId) {
  try {
    const data = await Drive.loadJson(fileId);
    pause();
    loadProjectData(data); project.driveFileId = fileId;
    await ensureSceneMedia();
    toast('تم فتح المشروع');
  } catch (e) { toast('تعذر الفتح: ' + e.message); }
}
function loadProjectData(data) {
  const refs = data.mediaRefs || [];
  delete data.mediaRefs;
  project = { ...newProject(), ...data, style: { ...BASE_STYLE, ...(data.style || {}) } };
  for (const r of refs) {
    if (media.has(r.id)) continue;
    if (r.driveId) { const m = registerDriveFile({ id: r.driveId, name: r.name, mimeType: r.mime }); if (m.id !== r.id) { media.delete(m.id); m.id = r.id; media.set(r.id, m); } }
  }
  // المراجع التي فُقدت (وسائط محلية لم تُرفع) تعود لخلفية القالب
  project.scenes.forEach(s => { if (s.media?.ref && !s.media.ref.startsWith('g-') && !media.has(s.media.ref)) s.media.ref = null; });
  if (project.extraAudio && !media.has(project.extraAudio)) project.extraAudio = null;
  selected = 0; t = 0; syncUI();
}
$('#saveTpl').onclick = async () => {
  if (!await requireDrive()) return;
  const name = prompt('اسم القالب:', 'قالبي ' + new Date().toLocaleDateString('ar-SA')); if (!name) return;
  try { await Drive.saveJson('templates', name + '.tpl.json', { name, style: project.style }); toast('تم حفظ القالب في درايف'); refreshDriveLists(); } catch (e) { toast(e.message); }
};

// ================= التصدير =================
function pickMime() {
  const c = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}
function openExport() {
  if (!project.scenes.length) return toast('أضف مشهداً أولاً');
  pause();
  const mime = pickMime();
  const body = $('#expBody'), foot = $('#expFoot');
  const T = totalDuration(project);
  const q = el('select', {}, el('option', { value: '1080', text: 'عالية 1080p (يُنصح به)' }), el('option', { value: '720', text: 'سريعة 720p (للأجهزة الضعيفة)' }));
  body.replaceChildren(
    el('p', { style: { marginTop: 0 }, text: `المدة: ${fmtT(T)} • المقاس: ${FORMATS[project.format].label}` }),
    field('الجودة', q),
    mime ? el('div', { class: 'note', text: /mp4/.test(mime) ? 'الصيغة: MP4 — جاهزة للرفع مباشرة على إنستقرام وتيك توك.' : 'الصيغة: WebM — متصفحك لا يدعم MP4. للرفع على إنستقرام استخدم Chrome أو Edge أو Safari حديثاً.' }) : el('div', { class: 'err', text: 'متصفحك لا يدعم تسجيل الفيديو. استخدم Chrome أو Edge أو Safari.' }),
    el('div', { class: 'note', text: 'التسجيل يتم بالوقت الحقيقي داخل متصفحك — أبقِ هذه الصفحة ظاهرة حتى ينتهي. لا يُرفع شيء إلى الموقع؛ الفيديو يُحفظ على جهازك أو في درايف.' }),
  );
  foot.replaceChildren(
    el('button', { class: 'btn', onclick: exportPng }, 'صورة PNG للإطار الحالي'),
    el('button', { class: 'btn gold', disabled: !mime, onclick: () => runExport(+q.value, mime) }, 'بدء التصدير'));
  $('#dlgExport').showModal();
}
$('#exportBtn').onclick = openExport;

function exportPng() {
  const c = document.createElement('canvas'); c.width = view.width; c.height = view.height;
  renderFrame(c.getContext('2d'), project, t, env);
  c.toBlob(async (b) => { downloadBlob(b, (project.name || 'reel') + '.png'); if (Drive.isConnected()) { try { await Drive.upload(b, (project.name || 'reel') + '.png', 'videos'); toast('حُفظت الصورة في درايف أيضاً'); } catch { } } }, 'image/png');
}
function downloadBlob(b, name) { const a = el('a', { href: URL.createObjectURL(b), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }

async function runExport(height, mime) {
  const body = $('#expBody'), foot = $('#expFoot');
  const f = FORMATS[project.format];
  const W = Math.round(f.w * (height === 720 ? 2 / 3 : 1) / 2) * 2, H = Math.round(f.h * (height === 720 ? 2 / 3 : 1) / 2) * 2;
  const bar = el('i'), label = el('p', { text: 'جارٍ تجهيز الوسائط والخطوط…' });
  body.replaceChildren(label, el('div', { class: 'progress' }, bar));
  const cancelBtn = el('button', { class: 'btn danger' }, 'إلغاء');
  foot.replaceChildren(cancelBtn);
  initAudio(); await AC.resume();
  await loadFonts(); await ensureSceneMedia();
  // انتظر جاهزية الصوت
  const urls = project.scenes.flatMap(s => s.content?.audio?.items?.map(i => i.url) || []);
  await Promise.all(urls.map(u => new Promise(r => { const a = audioEl(u); if (a.readyState >= 3) return r(); a.addEventListener('canplaythrough', r, { once: true }); a.addEventListener('error', r, { once: true }); a.load(); setTimeout(r, 12000); })));

  const C = document.createElement('canvas'); C.width = W; C.height = H; const cctx = C.getContext('2d');
  clearLayoutCache();
  const vstream = C.captureStream(0); // نطلب كل إطار يدوياً لضمان التقاطه
  const vtrack = vstream.getVideoTracks()[0];
  const stream = new MediaStream([...vstream.getVideoTracks(), ...streamDest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: height === 720 ? 5_000_000 : 10_000_000, audioBitsPerSecond: 160_000 });
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let cancelled = false;
  cancelBtn.onclick = () => { cancelled = true; rec.stop(); };
  const T = totalDuration(project);
  exporting = true; playing = true;
  renderFrame(cctx, project, 0, env);
  await new Promise(r => setTimeout(r, 120));
  rec.start(500);
  const t0 = performance.now();
  label.textContent = 'جارٍ التسجيل… أبقِ الصفحة ظاهرة';
  // المحرك: requestAnimationFrame والصفحة ظاهرة، ومؤقّت Worker إذا انتقلت للخلفية (حيث يتوقف rAF)
  const ticker = new Worker(URL.createObjectURL(new Blob(['let i=setInterval(()=>postMessage(0),33);onmessage=()=>clearInterval(i);'], { type: 'text/javascript' })));
  await new Promise((resolve) => {
    let finished = false, lastT = -1;
    const step = () => {
      if (finished) return;
      if (cancelled) { finished = true; return resolve(); }
      const tt = (performance.now() - t0) / 1000;
      if (tt >= T + 0.25) { finished = true; return resolve(); }
      if (tt - lastT < 0.03) return; // تجنب إطارين متطابقين من المحركين
      lastT = tt;
      const tc = Math.min(tt, T - 0.001);
      syncMedia(tc, true);
      renderFrame(cctx, project, tc, env);
      vtrack.requestFrame?.();
      if (!document.hidden) vctx.drawImage(C, 0, 0, view.width, view.height);
      bar.style.width = Math.min(100, tt / T * 100) + '%';
    };
    ticker.onmessage = () => { if (document.hidden) step(); };
    const raf = () => { if (finished) return; if (!document.hidden) step(); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  });
  ticker.postMessage(0); ticker.terminate();
  const done = new Promise(r => rec.onstop = r);
  if (rec.state !== 'inactive') rec.stop();
  await done;
  exporting = false; playing = false; syncMedia(t, false); clearLayoutCache(); requestDraw();
  if (cancelled) { $('#dlgExport').close(); toast('أُلغي التصدير'); return; }
  const ext = /mp4/.test(mime) ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const name = `${(project.name || 'reel').replace(/[\\/:*?"<>|]/g, '')}-${project.format.replace(':', 'x')}.${ext}`;
  const vid = el('video', { src: URL.createObjectURL(blob), controls: true, playsinline: true, style: { width: '100%', maxHeight: '46vh', borderRadius: '12px', background: '#000' } });
  const upBar = el('i'), upMsg = el('p', { class: 'hint', style: { margin: '8px 0 4px' } });
  body.replaceChildren(vid, el('p', { class: 'hint', text: `${name} • ${(blob.size / 1048576).toFixed(1)} MB` }), upMsg, el('div', { class: 'progress', style: { display: 'none' } }, upBar));
  const upBtn = el('button', { class: 'btn', onclick: () => upload() }, 'حفظ في درايف');
  foot.replaceChildren(upBtn, el('button', { class: 'btn gold', onclick: () => downloadBlob(blob, name) }, 'تنزيل على الجهاز'));
  async function upload() {
    if (!await requireDrive()) return;
    upBtn.disabled = true; upBar.parentElement.style.display = ''; upMsg.textContent = 'جارٍ الرفع إلى درايف…';
    try { const r = await Drive.upload(blob, name, 'videos', { onProgress: (p) => upBar.style.width = (p * 100) + '%' }); upMsg.replaceChildren('تم الحفظ في درايف ✓ ', el('a', { href: r.webViewLink, target: '_blank', rel: 'noopener', style: { color: 'var(--gold2)' } }, 'فتح الملف')); if (tabInit.projects) refreshDriveLists(); }
    catch (e) { upMsg.textContent = 'فشل الرفع: ' + e.message; upBtn.disabled = false; }
  }
  if (Drive.isConnected()) upload();
}

// ================= الخطوط =================
async function loadFonts() {
  const fam = new Set([project.style.fontAr, 'Amiri Quran', 'Cairo', 'Noto Naskh Arabic', 'Inter', project.style.fontTr]);
  const tasks = [...fam].map(f => document.fonts.load(`40px "${f}"`, 'بسم الله abc')).concat([document.fonts.load('700 40px "Cairo"', 'بسم'), document.fonts.load('600 40px "Cairo"', 'بسم')]);
  const trLangs = new Set(project.scenes.map(s => s.content?.trLang));
  if ([...trLangs].some(l => /^ur/.test(l || ''))) tasks.push(document.fonts.load('40px "Noto Nastaliq Urdu"', 'اردو'));
  if ([...trLangs].some(l => /^(fa|ps|ku|ug)/.test(l || ''))) tasks.push(document.fonts.load('40px "Vazirmatn"', 'فارسی'));
  await Promise.race([Promise.allSettled(tasks), new Promise(r => setTimeout(r, 6000))]);
}
document.fonts.addEventListener('loadingdone', () => { clearLayoutCache(); requestDraw(); scheduleThumbs(); });

// ================= عام =================
document.addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) c.closest('dialog').close(); });
$('#projName').oninput = (e) => { project.name = e.target.value; touch({ noThumbs: true }); };
const fmtSel = $('#format');
Object.entries(FORMATS).forEach(([k, v]) => fmtSel.append(el('option', { value: k, text: v.label })));
fmtSel.onchange = () => { project.format = fmtSel.value; setCanvasSize(); renderTimeline(); touch(); };
$('#safeT').onchange = () => { LS.set('rs.safe', $('#safeT').checked); fitCanvas(); };
$('#srcT').onchange = () => { project.style.showSource = $('#srcT').checked; touch(); };
$('#autoUp').onchange = () => { LS.set('rs.autoUp', $('#autoUp').checked); if ($('#autoUp').checked && Drive.isConnected()) uploadPending(); };

function syncUI() {
  $('#projName').value = project.name; fmtSel.value = project.format; $('#srcT').checked = project.style.showSource !== false;
  setCanvasSize(); renderTimeline(); renderSceneForm(); renderStyleForm(); renderMediaGrid(); renderAudioInfo();
  $$('#tplGrid .tpl').forEach((b, i) => b.setAttribute('aria-pressed', String(TEMPLATES[i].id === project.template)));
  updateTime(); requestDraw();
}
window.addEventListener('beforeunload', () => LS.set('rs.project', serializeProject()));

// ================= البدء =================
(async function boot() {
  buildRail(); placeSceneForm();
  $('#safeT').checked = LS.get('rs.safe', false); $('#autoUp').checked = LS.get('rs.autoUp', true);
  loadCfg();
  // استعادة مراجع الوسائط من الحفظ المحلي
  const saved = LS.get('rs.project', null);
  if (saved) loadProjectData(saved); else syncUI();
  switchTab(LS.get('rs.tab', 'quran'));
  await loadFonts(); clearLayoutCache();
  renderTemplates(); renderGenGrid(); syncUI();
  if (Drive.restoreSession()) { refreshDriveLists(); ensureSceneMedia(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
