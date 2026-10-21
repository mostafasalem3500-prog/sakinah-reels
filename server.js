// استوديو ريلز السكينة — خادم خفيف بلا اعتماديات
// يخدم الواجهة، ويمرّر طلبات المصادر الرسمية (حل مشكلة CORS)، ولا يخزن أي وسائط.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');

// مصادر مسموح بها فقط — ليس وكيلاً مفتوحاً
const UPSTREAMS = {
  quranenc: { base: 'https://quranenc.com/api/v1/', ok: /^(translations\/list(\/[a-z]{2,3})?|translation\/(sura|aya)\/[a-z0-9_]+\/\d{1,3}(\/\d{1,3})?)$/ },
  hadeethenc: { base: 'https://hadeethenc.com/api/v1/', ok: /^(languages|categories\/(roots|list)|hadeeths\/(list|one))\/?$/ },
};
const AUDIO_BASE = 'https://everyayah.com/data/';
const AUDIO_OK = /^[A-Za-z0-9_.\-]+\/\d{6}\.mp3$/;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

// ذاكرة مؤقتة صغيرة للنصوص فقط (JSON) — لا تخزين للصور أو الفيديو
const cache = new Map();
const CACHE_MAX = 600, CACHE_TTL = 1000 * 60 * 60 * 12;
function cacheGet(k) { const e = cache.get(k); if (!e) return null; if (Date.now() - e.t > CACHE_TTL) { cache.delete(k); return null; } cache.delete(k); cache.set(k, e); return e; }
function cacheSet(k, v) { cache.set(k, v); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

async function proxyJson(res, name, sub, search) {
  const up = UPSTREAMS[name];
  if (!up || !up.ok.test(sub)) return send(res, 400, JSON.stringify({ error: 'مسار غير مسموح' }), { 'Content-Type': 'application/json' });
  const url = up.base + sub + (search || '');
  const hit = cacheGet(url);
  if (hit) return send(res, 200, hit.body, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'HIT' });
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'SakinahReelsStudio/1.0' } });
    const body = await r.text();
    if (r.ok) cacheSet(url, { t: Date.now(), body });
    send(res, r.status, body, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': r.ok ? 'public, max-age=3600' : 'no-store' });
  } catch (e) {
    send(res, 502, JSON.stringify({ error: 'تعذر الوصول إلى المصدر', detail: String(e.message || e) }), { 'Content-Type': 'application/json' });
  }
}

async function proxyAudio(req, res, sub) {
  if (!AUDIO_OK.test(sub)) return send(res, 400, 'bad');
  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const r = await fetch(AUDIO_BASE + sub, { headers });
    const out = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=604800', 'Accept-Ranges': 'bytes' };
    for (const h of ['content-length', 'content-range']) { const v = r.headers.get(h); if (v) out[h] = v; }
    res.writeHead(r.status, out);
    if (r.body) Readable.fromWeb(r.body).pipe(res); else res.end();
  } catch (e) { send(res, 502, 'audio unavailable'); }
}

function serveStatic(req, res, p) {
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUB, decodeURIComponent(p)));
  if (!file.startsWith(PUB)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // تطبيق صفحة واحدة
      return fs.readFile(path.join(PUB, 'index.html'), (e2, buf) => e2 ? send(res, 404, 'not found') : send(res, 200, buf, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' }));
    }
    const ext = path.extname(file);
    const noCache = ext === '.html' || p === '/sw.js';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (p === '/config.js') {
    const cfg = { googleClientId: process.env.GOOGLE_CLIENT_ID || '', googleApiKey: process.env.GOOGLE_API_KEY || '', googleAppId: process.env.GOOGLE_APP_ID || '' };
    return send(res, 200, 'window.RS_CONFIG=' + JSON.stringify(cfg) + ';', { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
  }
  if (p === '/health') return send(res, 200, 'ok');
  let m;
  if ((m = p.match(/^\/api\/(quranenc|hadeethenc)\/(.+)$/))) return proxyJson(res, m[1], m[2].replace(/\/+$/, (s) => s ? '/' : ''), u.search);
  if ((m = p.match(/^\/api\/audio\/(.+)$/))) return proxyAudio(req, res, m[1]);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method');
  serveStatic(req, res, p);
}).listen(PORT, () => console.log('Sakinah Reels Studio on :' + PORT));
