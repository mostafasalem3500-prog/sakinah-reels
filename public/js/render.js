// محرك الرسم: يرسم إطاراً واحداً للمشروع عند الزمن t (ثوانٍ) على Canvas
import { GEN_BACKGROUNDS } from './data.js';

const RTL_LANGS = new Set(['ar', 'ur', 'fa', 'ps', 'he', 'ku', 'ckb', 'ug', 'dv', 'sd', 'yi']);
export const isRtl = (lang) => RTL_LANGS.has((lang || '').slice(0, 3).replace(/[-_].*/, ''));
export const toArDigits = (n) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

const TRANS_DUR = 0.6;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeBack = (x) => { x = clamp(x); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function rnd(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
function hexA(hex, a) {
  let h = (hex || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function totalDuration(p) { return p.scenes.reduce((s, x) => s + (x.duration || 5), 0); }
export function sceneAt(p, t) {
  let start = 0;
  for (let i = 0; i < p.scenes.length; i++) {
    const d = p.scenes[i].duration || 5;
    if (t < start + d || i === p.scenes.length - 1) return { i, lt: Math.max(0, t - start), start };
    start += d;
  }
  return { i: 0, lt: 0, start: 0 };
}

// ---------- طبقة مؤقتة للانتقالات ----------
let layer = null;
function getLayer(w, h) {
  if (!layer) layer = document.createElement('canvas');
  if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
  return layer;
}

// ---------- الرسم الرئيسي ----------
export function renderFrame(ctx, p, t, env) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!p.scenes.length) { drawEmpty(ctx, W, H, p.style); ctx.restore(); return; }
  const { i, lt } = sceneAt(p, t);
  const sc = p.scenes[i];
  const tr = sc.transition || p.style.transition;
  if (i > 0 && lt < TRANS_DUR && tr !== 'none') {
    const prev = p.scenes[i - 1];
    renderScene(ctx, p, prev, i - 1, (prev.duration || 5) + lt, env);
    const L = getLayer(W, H), lc = L.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.filter = 'none';
    renderScene(lc, p, sc, i, lt, env);
    const q = easeInOut(lt / TRANS_DUR);
    ctx.save();
    if (tr === 'slide') { ctx.translate(-(1 - q) * W, 0); }
    else if (tr === 'zoom') { const s = 1.25 - .25 * q; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha = q; }
    else if (tr === 'blur') { ctx.globalAlpha = q; if (env.canFilter) ctx.filter = `blur(${(1 - q) * 24}px)`; }
    else { ctx.globalAlpha = q; }
    ctx.drawImage(L, 0, 0);
    ctx.restore();
  } else {
    renderScene(ctx, p, sc, i, lt, env);
  }
  // عناصر عامة فوق كل المشاهد
  const st = p.style;
  if (st.progress) {
    const T = totalDuration(p);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, 0, W, 8);
    ctx.fillStyle = st.accent; ctx.fillRect(W - W * (t / T), 0, W * (t / T), 8);
  }
  if (st.handle) {
    ctx.font = `600 ${Math.round(W * 0.026)}px "Cairo", sans-serif`;
    ctx.textAlign = 'center'; ctx.direction = 'ltr'; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8;
    ctx.fillText(st.handle, W / 2, H * 0.075);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawEmpty(ctx, W, H, st) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b3d2e'); g.addColorStop(1, '#04130e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(212,175,55,.85)'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.font = `700 ${W * 0.05}px "Cairo", sans-serif`;
  ctx.fillText('أضف مشهداً للبدء', W / 2, H / 2);
  ctx.font = `400 ${W * 0.03}px "Cairo", sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText('اختر آية أو حديثاً أو قولاً من القائمة', W / 2, H / 2 + W * 0.07);
}

function renderScene(ctx, p, sc, idx, lt, env) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const st = { ...p.style, ...(sc.style || {}) };
  const D = sc.duration || 5;
  const q = clamp(lt / D);
  ctx.save();
  drawBackground(ctx, W, H, sc, st, idx, lt, q, env);
  drawOverlay(ctx, W, H, st);
  if (st.pattern !== 'none') drawPattern(ctx, W, H, st, lt + idx * 7);
  if (st.rays) drawRays(ctx, W, H, st, lt + idx * 3);
  if (st.particles !== 'none') drawParticles(ctx, W, H, st, lt + idx * 11);
  if (st.frame !== 'none') drawFrame(ctx, W, H, st, lt);
  drawText(ctx, W, H, sc, st, lt, D, env);
  ctx.restore();
}

// ---------- الخلفية ----------
function drawBackground(ctx, W, H, sc, st, idx, lt, q, env) {
  const ref = sc.media?.ref || st.defaultBg;
  const m = env.getMedia(ref);
  if (m && (m.kind === 'image' || m.kind === 'video') && m.ready) {
    const iw = m.kind === 'video' ? m.el.videoWidth : m.el.naturalWidth;
    const ih = m.kind === 'video' ? m.el.videoHeight : m.el.naturalHeight;
    if (!iw || !ih) return drawGen(ctx, W, H, GEN_BACKGROUNDS[0], st, lt);
    const motion = sc.media?.motion || st.bgMotion;
    let s = 1, dx = 0, dy = 0;
    const qq = easeInOut(q), mild = m.kind === 'video' ? 0.4 : 1;
    if (motion === 'kenburns') { s = 1.06 + 0.12 * qq * mild; const dir = idx % 2 ? 1 : -1; dx = dir * W * 0.035 * (qq - .5) * mild; dy = -H * 0.02 * (qq - .5) * mild; }
    else if (motion === 'zoomin') s = 1 + 0.16 * qq * mild;
    else if (motion === 'zoomout') s = 1.16 - 0.16 * qq * mild;
    else if (motion === 'panleft' || motion === 'panright') { s = 1.18; dx = (motion === 'panleft' ? 1 : -1) * W * 0.07 * (qq - .5) * 2 * mild; }
    const fit = sc.media?.fit || 'cover';
    const cover = Math.max(W / iw, H / ih);
    if (fit === 'contain') {
      // خلفية ضبابية + الصورة كاملة
      ctx.save();
      if (env.canFilter) ctx.filter = 'blur(38px) brightness(.7)';
      const cw = iw * cover * 1.1, ch = ih * cover * 1.1;
      ctx.drawImage(m.el, (W - cw) / 2, (H - ch) / 2, cw, ch);
      ctx.restore();
      if (!env.canFilter) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); }
      const c = Math.min(W / iw, H / ih) * s;
      ctx.drawImage(m.el, (W - iw * c) / 2 + dx, (H - ih * c) / 2 + dy, iw * c, ih * c);
    } else {
      const c = cover * s;
      ctx.drawImage(m.el, (W - iw * c) / 2 + dx, (H - ih * c) / 2 + dy, iw * c, ih * c);
    }
    return;
  }
  const gen = GEN_BACKGROUNDS.find(g => g.id === ref) || GEN_BACKGROUNDS.find(g => g.id === st.defaultBg) || GEN_BACKGROUNDS[0];
  drawGen(ctx, W, H, gen, st, lt + idx * 5);
}

function drawGen(ctx, W, H, g, st, t) {
  const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.stops.forEach((c, i) => grad.addColorStop(i / (g.stops.length - 1), c));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  if (g.anim === 'aurora') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const x = W * (0.5 + 0.35 * Math.sin(t * 0.15 + k * 2.1)), y = H * (0.35 + 0.25 * Math.cos(t * 0.12 + k * 1.7));
      const r = W * (0.55 + 0.1 * k);
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(k === 1 ? st.accent : g.stops[0], 0.22)); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  } else if (g.anim === 'stars') {
    for (let i = 0; i < 160; i++) {
      const a = 0.25 + 0.75 * Math.abs(Math.sin(t * (0.5 + rnd(i, 3) * 1.5) + rnd(i, 4) * 6));
      ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
      ctx.beginPath(); ctx.arc(rnd(i, 1) * W, rnd(i, 2) * H * 0.85, 0.8 + rnd(i, 5) * 2.2, 0, 7); ctx.fill();
    }
  } else if (g.anim === 'rays') {
    drawRays(ctx, W, H, { accent: '#fff4d6' }, t);
  }
}

// ---------- طبقة التعتيم ----------
function drawOverlay(ctx, W, H, st) {
  const o = st.overlayOpacity;
  if (st.overlay === 'dark') { ctx.fillStyle = `rgba(0,0,0,${o})`; ctx.fillRect(0, 0, W, H); }
  else if (st.overlay === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(0,0,0,${o * 0.55})`); g.addColorStop(0.45, `rgba(0,0,0,${o * 0.65})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(1, o * 1.4)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (st.overlay === 'vignette') {
    const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, `rgba(0,0,0,${o * 0.35})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(1, o * 1.3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (st.overlay === 'tint') { ctx.fillStyle = hexA(st.tint, o); ctx.fillRect(0, 0, W, H); }
}

// ---------- زخرفة هندسية ----------
function drawPattern(ctx, W, H, st, t) {
  ctx.save();
  ctx.strokeStyle = hexA(st.accent, 0.16); ctx.lineWidth = 2;
  const S = W / 4.5;
  ctx.translate(W / 2, H / 2); ctx.rotate(t * 0.02); ctx.translate(-W / 2, -H / 2 + (t * 8) % S);
  const R = S * 0.42;
  for (let y = -S * 2; y < H + S * 2; y += S) for (let x = -S; x < W + S; x += S) {
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let j = 0; j < 4; j++) {
        const a = k * Math.PI / 4 + j * Math.PI / 2 + Math.PI / 4;
        const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
        j ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, y, R * 0.38, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + R, y); ctx.lineTo(x + S - R, y); ctx.moveTo(x, y + R); ctx.lineTo(x, y + S - R); ctx.stroke();
  }
  ctx.restore();
}

// ---------- أشعة ضوء ----------
function drawRays(ctx, W, H, st, t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cx = W * 0.5, cy = -H * 0.08;
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + (k - 3) * 0.17 + Math.sin(t * 0.25 + k) * 0.03;
    const len = H * 1.25, wdt = 0.05 + 0.03 * rnd(k, 9);
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    const al = 0.07 + 0.05 * Math.sin(t * 0.6 + k * 1.3);
    g.addColorStop(0, hexA(st.accent || '#fff4d6', al)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a - wdt) * len, cy + Math.sin(a - wdt) * len);
    ctx.lineTo(cx + Math.cos(a + wdt) * len, cy + Math.sin(a + wdt) * len);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------- جزيئات ----------
function drawParticles(ctx, W, H, st, t) {
  ctx.save();
  const type = st.particles;
  if (type === 'dust') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const sp = 18 + rnd(i, 1) * 40;
      const x = rnd(i, 2) * W + Math.sin(t * 0.4 + rnd(i, 3) * 6) * 30;
      const y = ((rnd(i, 4) * H - t * sp) % H + H) % H;
      const r = 1.2 + rnd(i, 5) * 3.2;
      const a = 0.25 + 0.6 * Math.abs(Math.sin(t * (0.6 + rnd(i, 6)) + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, hexA(st.accent, a)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 7); ctx.fill();
    }
  } else if (type === 'stars') {
    for (let i = 0; i < 130; i++) {
      const a = 0.2 + 0.8 * Math.abs(Math.sin(t * (0.4 + rnd(i, 3) * 1.6) + rnd(i, 4) * 6));
      const x = rnd(i, 1) * W, y = rnd(i, 2) * H, r = 0.7 + rnd(i, 5) * 2;
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (rnd(i, 7) > 0.93) { ctx.strokeStyle = `rgba(255,255,255,${a * 0.5})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - r * 5, y); ctx.lineTo(x + r * 5, y); ctx.moveTo(x, y - r * 5); ctx.lineTo(x, y + r * 5); ctx.stroke(); }
    }
  } else if (type === 'snow') {
    for (let i = 0; i < 90; i++) {
      const sp = 40 + rnd(i, 1) * 80;
      const x = rnd(i, 2) * W + Math.sin(t * 0.8 + i) * 25;
      const y = ((rnd(i, 4) * H + t * sp) % H);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd(i, 6) * 0.5})`;
      ctx.beginPath(); ctx.arc(x, y, 1.5 + rnd(i, 5) * 3.5, 0, 7); ctx.fill();
    }
  } else if (type === 'bokeh') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const sp = 10 + rnd(i, 1) * 20;
      const x = rnd(i, 2) * W + Math.sin(t * 0.2 + i) * 40;
      const y = ((rnd(i, 4) * H - t * sp) % H + H) % H;
      const r = W * (0.03 + rnd(i, 5) * 0.07);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexA(st.accent, 0.16)); g.addColorStop(0.7, hexA(st.accent, 0.08)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- الإطارات (ترسم نفسها تدريجياً) ----------
function drawFrame(ctx, W, H, st, lt) {
  const prog = easeOut(lt / 1.4);
  ctx.save();
  ctx.strokeStyle = hexA(st.accent, 0.85); ctx.lineWidth = Math.max(2, W * 0.0022);
  const m = W * 0.045;
  const dash = (len) => { ctx.setLineDash([len, len]); ctx.lineDashOffset = len * (1 - prog); };
  if (st.frame === 'thin' || st.frame === 'double') {
    const per = 2 * (W + H);
    dash(per); ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    if (st.frame === 'double') { ctx.lineWidth *= 0.6; ctx.strokeRect(m * 1.45, m * 1.45, W - 2.9 * m, H - 2.9 * m); }
  } else if (st.frame === 'corners') {
    const L = W * 0.12 * prog;
    ctx.setLineDash([]);
    const c = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
    for (const [x, y, sx, sy] of c) {
      ctx.beginPath(); ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L); ctx.stroke();
      ctx.save(); ctx.fillStyle = hexA(st.accent, 0.9 * prog); ctx.translate(x + sx * m * 0.55, y + sy * m * 0.55); ctx.rotate(Math.PI / 4);
      const d = W * 0.008; ctx.fillRect(-d, -d, 2 * d, 2 * d); ctx.restore();
    }
  } else if (st.frame === 'arch') {
    const x0 = m * 1.2, x1 = W - m * 1.2, yb = H - m * 1.6, top = H * 0.13, spring = H * 0.25;
    const cx = W / 2;
    ctx.beginPath();
    ctx.moveTo(x0, yb); ctx.lineTo(x0, spring);
    ctx.quadraticCurveTo(x0, top + (spring - top) * 0.25, cx, top);
    ctx.quadraticCurveTo(x1, top + (spring - top) * 0.25, x1, spring);
    ctx.lineTo(x1, yb); ctx.closePath();
    const per = 2 * (yb - spring) + (x1 - x0) * 1.9 + (x1 - x0);
    dash(per); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hexA(st.accent, 0.9 * prog);
    ctx.beginPath(); ctx.arc(cx, top - W * 0.02, W * 0.008, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---------- تخطيط النص ----------
const layoutCache = new Map();
const QURAN_FONTS = new Set(['Amiri Quran', 'Scheherazade New', 'Amiri']);
function fontFor(kind, st, lang, ctype) {
  if (kind === 'ar') {
    // الرسم العثماني يحتاج خطاً يدعم علامات المصحف؛ الخطوط الأخرى تُستبدل تلقائياً للآيات
    const f = ctype === 'ayah' && !QURAN_FONTS.has(st.fontAr) ? 'Amiri Quran' : st.fontAr;
    return `"${f}", "Amiri", serif`;
  }
  if (kind === 'tafsir' || kind === 'refAr') return `"Noto Naskh Arabic", "Amiri", serif`;
  if (lang && /^ur/.test(lang)) return `"Noto Nastaliq Urdu", "Noto Naskh Arabic", serif`;
  if (isRtl(lang)) return `"Vazirmatn", "Noto Naskh Arabic", sans-serif`;
  return `"${st.fontTr}", "Noto Sans", system-ui, sans-serif`;
}
function lineHeightFor(kind, st, lang, ctype) {
  if (kind === 'ar' && ctype === 'ayah' && !QURAN_FONTS.has(st.fontAr)) return 1.95;
  if (kind === 'ar') return /Amiri Quran|Scheherazade/.test(st.fontAr) ? 1.95 : (/Aref|Reem/.test(st.fontAr) ? 1.75 : 1.6);
  if (lang && /^ur/.test(lang)) return 2.1;
  if (kind === 'tafsir') return 1.7;
  return 1.45;
}
function wrap(ctx, text, maxW, rtl) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const space = ctx.measureText(' ').width;
  const lines = []; let cur = [], curW = 0;
  const push = () => { if (cur.length) lines.push({ words: cur, width: curW }); cur = []; curW = 0; };
  for (let w of words) {
    let ww = ctx.measureText(w).width;
    if (ww > maxW) { // كلمة طويلة جداً (لغات بلا مسافات)
      push();
      let chunk = '';
      for (const ch of w) { if (ctx.measureText(chunk + ch).width > maxW) { const cw = ctx.measureText(chunk).width; lines.push({ words: [{ t: chunk, w: cw }], width: cw }); chunk = ch; } else chunk += ch; }
      w = chunk; ww = ctx.measureText(w).width;
    }
    const add = (cur.length ? space : 0) + ww;
    if (curW + add > maxW && cur.length) { push(); cur.push({ t: w, w: ww }); curW = ww; }
    else { cur.push({ t: w, w: ww }); curW += add; }
  }
  push();
  return { lines, space, rtl };
}

function sceneTexts(sc, st) {
  const c = sc.content || {};
  const showTr = sc.showTr ?? st.showTr, showTaf = sc.showTafsir ?? st.showTafsir;
  const blocks = [];
  if (c.ar) blocks.push({ kind: 'ar', text: c.ar, lang: 'ar' });
  if (showTr && c.tr) blocks.push({ kind: 'tr', text: c.tr, lang: c.trLang || 'en' });
  if (showTaf && c.tafsir) blocks.push({ kind: 'tafsir', text: c.tafsir, lang: 'ar' });
  return blocks;
}

function computeLayout(ctx, W, H, sc, st) {
  const blocks = sceneTexts(sc, st);
  const key = [sc.id, W, H, st.fontAr, st.fontTr, st.arSize, st.trSize, st.tafsirSize, st.vpos, st.box, st.showRef, sc.content?.ref, ...blocks.map(b => b.kind + b.text.length + b.text.slice(0, 12))].join('|');
  if (layoutCache.has(key)) return layoutCache.get(key);
  const scaleW = W / 1080;
  const tall = H / W > 1.5;
  let area;
  if (st.vpos === 'upper') area = { top: H * 0.12, bottom: H * (tall ? 0.56 : 0.6) };
  else if (st.vpos === 'lower') area = { top: H * (tall ? 0.48 : 0.42), bottom: H * (tall ? 0.80 : 0.88) };
  else if (st.vpos === 'top') area = { top: H * 0.1, bottom: H * 0.45 };
  else area = { top: H * (tall ? 0.15 : 0.1), bottom: H * (tall ? 0.80 : 0.9) };
  if (st.vpos === 'upper' && blocks.some(b => b.kind === 'tafsir')) area.bottom = H * (tall ? 0.80 : 0.9);
  const padX = W * (st.box === 'none' || st.box === 'ribbon' ? 0.09 : 0.13);
  const maxW = W - padX * 2;
  const refH = st.showRef && sc.content?.ref ? 70 * scaleW : 0;
  let f = 1, res;
  for (let iter = 0; iter < 14; iter++) {
    let total = 0; const out = [];
    blocks.forEach((b, bi) => {
      const base = (b.kind === 'ar' ? st.arSize : b.kind === 'tafsir' ? st.tafsirSize : st.trSize) * scaleW * f;
      const size = Math.max(14, base);
      const ctype = sc.content?.type;
      const quranSub = b.kind === 'ar' && ctype === 'ayah' && !QURAN_FONTS.has(st.fontAr);
      const weight = b.kind === 'ar' ? (!quranSub && /Cairo|Tajawal|Reem/.test(st.fontAr) ? 700 : 400) : (b.kind === 'tafsir' ? 400 : 500);
      const font = `${weight} ${size}px ${fontFor(b.kind, st, b.lang, ctype)}`;
      ctx.font = font; ctx.direction = isRtl(b.lang) ? 'rtl' : 'ltr';
      const lw = wrap(ctx, b.text, b.kind === 'tafsir' ? maxW * 0.94 : maxW, isRtl(b.lang));
      const lh = size * lineHeightFor(b.kind, st, b.lang, ctype);
      const gap = bi ? size * (b.kind === 'tafsir' ? 1.1 : 0.9) : 0;
      total += gap + lw.lines.length * lh;
      out.push({ ...b, font, size, lh, gap, ...lw });
    });
    total += refH ? refH + 30 * scaleW : 0;
    res = { blocks: out, total, area, maxW, refH, scaleW };
    if (total <= (area.bottom - area.top) || f < 0.4) break;
    f *= 0.92;
  }
  layoutCache.set(key, res);
  if (layoutCache.size > 300) layoutCache.delete(layoutCache.keys().next().value);
  return res;
}
export function clearLayoutCache() { layoutCache.clear(); }

// ---------- رسم النص مع الحركة ----------
function drawText(ctx, W, H, sc, st, lt, D, env) {
  const L = computeLayout(ctx, W, H, sc, st);
  if (!L.blocks.length && !(st.showRef && sc.content?.ref)) return;
  const { area, total, scaleW } = L;
  let y0 = area.top + ((area.bottom - area.top) - total) / 2;
  if (st.vpos === 'lower') y0 = Math.max(area.top, area.bottom - total);
  const anim = sc.textAnim || st.textAnim;
  const t0 = 0.35;
  const ar = L.blocks.find(b => b.kind === 'ar');
  const arWords = ar ? ar.lines.reduce((s, l) => s + l.words.length, 0) : 0;
  const revealSpan = Math.min(D * 0.5, Math.max(0.8, arWords * 0.22));
  const step = arWords ? revealSpan / arWords : 0;
  const arEnd = anim === 'words' || anim === 'typewriter' ? t0 + revealSpan + 0.3 : (anim === 'rise' ? t0 + (ar?.lines.length || 1) * 0.28 + 0.4 : t0 + 0.9);
  const audioDur = sc.content?.audio?.dur || D - 0.6;

  // الصندوق
  const boxTop = y0 - 50 * scaleW, boxH = total + 100 * scaleW;
  const blockAlpha = anim === 'highlight' || anim === 'words' || anim === 'typewriter' ? easeOut((lt - 0.1) / 0.5) : easeOut((lt - t0 + 0.2) / 0.8);
  drawBox(ctx, W, H, st, boxTop, boxH, blockAlpha, env);

  ctx.save();
  if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18 * scaleW; ctx.shadowOffsetY = 3 * scaleW; }
  let y = y0;
  let gi = 0; // فهرس الكلمة العام للعربية
  // أوزان الكلمات لمزامنة الإبراز مع التلاوة
  let cum = [], totalChars = 0;
  if (ar && anim === 'highlight') { ar.lines.forEach(l => l.words.forEach(w => { totalChars += w.t.length + 1; cum.push(totalChars); })); }
  const hlPos = anim === 'highlight' ? clamp((lt - 0.4) / Math.max(1, audioDur - 0.2)) * totalChars : 0;

  for (const b of L.blocks) {
    y += b.gap;
    ctx.font = b.font; ctx.textBaseline = 'middle';
    const rtl = b.rtl; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left';
    const isAr = b.kind === 'ar';
    const color = isAr ? st.textColor : (b.kind === 'tafsir' ? st.trColor : st.trColor);
    let bAlpha = 1, bShift = 0, bScale = 1, blur = 0;
    if (!isAr) { const k = easeOut((lt - arEnd) / 0.7); bAlpha = k; bShift = (1 - k) * 18 * scaleW; }
    else if (anim === 'fade') { const k = easeOut((lt - t0) / 0.9); bAlpha = k; bShift = (1 - k) * 26 * scaleW; }
    else if (anim === 'zoom') { const k = clamp((lt - t0) / 0.7); bAlpha = easeOut(k); bScale = 0.82 + 0.18 * easeBack(k); }
    else if (anim === 'blur') { const k = easeOut((lt - t0) / 1.1); bAlpha = k; blur = (1 - k) * 18; }
    if (bAlpha <= 0.001) { y += b.lines.length * b.lh; if (isAr) gi += arWords; continue; }
    ctx.save();
    const blockH = b.lines.length * b.lh;
    if (bScale !== 1) { const cy = y + blockH / 2; ctx.translate(W / 2, cy); ctx.scale(bScale, bScale); ctx.translate(-W / 2, -cy); }
    if (blur && env.canFilter) ctx.filter = `blur(${blur * scaleW}px)`;
    if (b.kind === 'tafsir') { // عنوان صغير
      ctx.save(); ctx.font = `700 ${b.size * 0.72}px "Cairo", sans-serif`; ctx.fillStyle = hexA(st.accent, bAlpha); ctx.textAlign = 'center'; ctx.direction = 'rtl';
      ctx.fillText(sc.content.tafsirLabel || 'التفسير الميسر', W / 2, y - b.size * 0.55); ctx.restore();
    }
    b.lines.forEach((line, li) => {
      const ly = y + b.lh * (li + 0.5) + bShift;
      let lineAlpha = bAlpha, lineShift = 0;
      if (isAr && anim === 'rise') { const k = easeOut((lt - t0 - li * 0.28) / 0.6); lineAlpha = k; lineShift = (1 - k) * 40 * scaleW; }
      // حساب مواضع الكلمات
      let x = rtl ? W / 2 + line.width / 2 : W / 2 - line.width / 2;
      for (const w of line.words) {
        const wx = rtl ? x - w.w : x;
        let a = lineAlpha, dy = lineShift, col = color;
        if (isAr && (anim === 'words' || anim === 'typewriter')) {
          const k = anim === 'typewriter' ? (lt >= t0 + gi * step ? 1 : 0) : easeOut((lt - t0 - gi * step) / 0.45);
          a = k; dy = (1 - k) * 22 * scaleW;
        } else if (isAr && anim === 'highlight') {
          const start = gi ? cum[gi - 1] : 0, end = cum[gi];
          a = blockAlpha;
          if (hlPos >= start && hlPos < end) col = st.accent; else if (hlPos < start) a = blockAlpha * 0.55;
        }
        if (a > 0.001) {
          ctx.globalAlpha = a;
          ctx.fillStyle = col;
          ctx.fillText(w.t, wx, ly + dy);
        }
        x += rtl ? -(w.w + b.space) : (w.w + b.space);
        if (isAr) gi++;
      }
    });
    ctx.restore();
    y += blockH;
  }
  ctx.restore();
  // المرجع
  if (st.showRef && sc.content?.ref) {
    const k = easeOut((lt - arEnd + 0.2) / 0.7);
    if (k > 0) drawRef(ctx, W, y + 30 * scaleW + L.refH / 2, sc.content.ref, st, k, scaleW);
  }
  // سطر المصدر
  if (st.showSource !== false && sc.content?.source) {
    ctx.save(); ctx.globalAlpha = 0.6 * easeOut((lt - 0.6) / 0.8);
    ctx.font = `400 ${Math.round(24 * scaleW)}px "Cairo", sans-serif`;
    ctx.fillStyle = st.trColor; ctx.textAlign = 'center'; ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
    if (st.shadow) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 6; }
    const tall = H / W > 1.5;
    ctx.fillText(sc.content.source, W / 2, H * (tall ? 0.86 : 0.955));
    ctx.restore();
  }
}

function drawRef(ctx, W, cy, text, st, a, s) {
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = `600 ${Math.round(30 * s)}px "Cairo", sans-serif`; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width, ph = 62 * s, pw = tw + 70 * s;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.strokeStyle = hexA(st.accent, 0.9); ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.roundRect(W / 2 - pw / 2, cy - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = st.accent; ctx.fillText(text, W / 2, cy + 2 * s);
  ctx.restore();
}

function drawBox(ctx, W, H, st, top, h, a, env) {
  if (st.box === 'none' || a <= 0) return;
  const s = W / 1080;
  ctx.save(); ctx.globalAlpha = a;
  if (st.box === 'ribbon') {
    ctx.fillStyle = hexA(st.boxColor, st.boxOpacity); ctx.fillRect(0, top, W, h);
    ctx.fillStyle = hexA(st.accent, 0.9); ctx.fillRect(0, top, W, 3 * s); ctx.fillRect(0, top + h - 3 * s, W, 3 * s);
  } else {
    const x = W * 0.07, w = W * 0.86, r = 40 * s;
    ctx.beginPath(); ctx.roundRect(x, top, w, h, r);
    if (st.box === 'glass') {
      ctx.save(); ctx.clip();
      if (env.canFilter) { ctx.filter = 'blur(26px)'; ctx.drawImage(ctx.canvas, x, top, w, h, x, top, w, h); ctx.filter = 'none'; }
      ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fillRect(x, top, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, top, w, h);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2 * s; ctx.stroke();
    } else if (st.box === 'card') {
      ctx.fillStyle = hexA(st.boxColor, st.boxOpacity); ctx.fill();
      ctx.strokeStyle = hexA(st.accent, 0.7); ctx.lineWidth = 2.5 * s; ctx.stroke();
    } else { ctx.fillStyle = hexA(st.boxColor, st.boxOpacity); ctx.fill(); }
  }
  ctx.restore();
}

export function suggestDuration(content) {
  if (content?.audio?.dur) return Math.round((content.audio.dur + 1.0) * 10) / 10;
  const words = (content?.ar || '').split(/\s+/).length + (content?.tr || '').split(/\s+/).length * 0.4;
  return Math.max(5, Math.min(20, Math.round(3 + words * 0.42)));
}
