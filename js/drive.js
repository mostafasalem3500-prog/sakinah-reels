// تكامل Google Drive — كل الوسائط والمشاريع والفيديوهات تُحفظ في درايف المستخدم فقط
// الصلاحية: drive.file (يرى التطبيق فقط الملفات التي أنشأها أو اختارها المستخدم)
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const ROOT_NAME = 'استوديو ريلز السكينة';
const SUBS = { media: 'الوسائط', projects: 'المشاريع', videos: 'الفيديوهات', templates: 'القوالب' };

let tokenClient = null, token = null, tokenExp = 0, cfg = {};
const folders = {};
const listeners = new Set();
export const onDriveChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach(fn => { try { fn(isConnected()); } catch { } });

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('تعذر تحميل ' + src));
    document.head.appendChild(s);
  });
}

export function configure(c) { cfg = { ...cfg, ...c }; tokenClient = null; }
export function getConfig() { return cfg; }
export const isConnected = () => !!token && Date.now() < tokenExp;

export async function connect(prompt = '') {
  if (!cfg.clientId) throw new Error('NO_CLIENT_ID');
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId, scope: SCOPE,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        token = r.access_token; tokenExp = Date.now() + (r.expires_in - 60) * 1000;
        try { sessionStorage.setItem('rs.tok', JSON.stringify({ token, tokenExp })); } catch { }
        emit(); resolve(true);
      },
      error_callback: (e) => reject(new Error(e?.message || e?.type || 'popup')),
    });
    tokenClient.requestAccessToken({ prompt });
  });
}
export function restoreSession() {
  try { const s = JSON.parse(sessionStorage.getItem('rs.tok')); if (s && Date.now() < s.tokenExp) { token = s.token; tokenExp = s.tokenExp; emit(); return true; } } catch { }
  return false;
}
export function disconnect() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => { });
  token = null; tokenExp = 0; Object.keys(folders).forEach(k => delete folders[k]);
  try { sessionStorage.removeItem('rs.tok'); } catch { }
  emit();
}
async function ensureToken() {
  if (isConnected()) return token;
  await connect('');
  return token;
}

async function api(path, opts = {}, base = API) {
  const tk = await ensureToken();
  const r = await fetch(base + path, { ...opts, headers: { Authorization: 'Bearer ' + tk, ...(opts.headers || {}) } });
  if (r.status === 401) { token = null; emit(); throw new Error('انتهت الجلسة — أعد الاتصال بدرايف'); }
  if (!r.ok) { let m = r.statusText; try { m = (await r.json()).error.message; } catch { } throw new Error('Drive: ' + m); }
  return r;
}
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findOrCreateFolder(name, parent) {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${q(name)}' and trashed=false` + (parent ? ` and '${parent}' in parents` : ` and 'root' in parents`);
  const r = await (await api(`/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`)).json();
  if (r.files?.length) return r.files[0].id;
  const c = await (await api('/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined }) })).json();
  return c.id;
}
export async function folder(kind) {
  if (folders[kind]) return folders[kind];
  if (!folders.root) folders.root = await findOrCreateFolder(ROOT_NAME, null);
  if (kind === 'root') return folders.root;
  folders[kind] = await findOrCreateFolder(SUBS[kind], folders.root);
  return folders[kind];
}

export async function listFiles(kind, mimePrefix) {
  const fid = await folder(kind);
  let query = `'${fid}' in parents and trashed=false`;
  if (mimePrefix) query += ` and (${mimePrefix.map(m => `mimeType contains '${m}'`).join(' or ')})`;
  const out = []; let pageToken = '';
  do {
    const r = await (await api(`/files?q=${encodeURIComponent(query)}&orderBy=modifiedTime desc&pageSize=200&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink)${pageToken ? '&pageToken=' + pageToken : ''}`)).json();
    out.push(...(r.files || [])); pageToken = r.nextPageToken || '';
  } while (pageToken && out.length < 1000);
  return out;
}

export async function download(fileId) {
  const r = await api(`/files/${fileId}?alt=media`);
  return r.blob();
}
export async function meta(fileId) {
  return (await api(`/files/${fileId}?fields=id,name,mimeType,size,webViewLink`)).json();
}

// رفع قابل للاستئناف مع تقدم
export async function upload(blob, name, kind, { fileId = null, onProgress } = {}) {
  const tk = await ensureToken();
  const metaBody = fileId ? { name } : { name, parents: [await folder(kind)] };
  const init = await fetch(`${UP}/files${fileId ? '/' + fileId : ''}?uploadType=resumable&fields=id,name,mimeType,webViewLink`, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': blob.type || 'application/octet-stream', 'X-Upload-Content-Length': String(blob.size) },
    body: JSON.stringify(metaBody),
  });
  if (!init.ok) { let m = init.statusText; try { m = (await init.json()).error.message; } catch { } throw new Error('Drive upload: ' + m); }
  const loc = init.headers.get('Location');
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', loc);
    x.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => x.status < 300 ? res(JSON.parse(x.responseText)) : rej(new Error('Drive upload ' + x.status));
    x.onerror = () => rej(new Error('انقطع الرفع'));
    x.send(blob);
  });
}

export async function saveJson(kind, name, obj, fileId) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  return upload(blob, name, kind, { fileId });
}
export async function loadJson(fileId) { return JSON.parse(await (await download(fileId)).text()); }
export async function trash(fileId) {
  return api(`/files/${fileId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
}

// منتقي جوجل (اختياري — يحتاج مفتاح API ورقم المشروع) لاختيار ملفات موجودة مسبقاً في الدرايف
export async function pick({ multiple = true, views = ['image', 'video'] } = {}) {
  if (!cfg.apiKey) throw new Error('NO_API_KEY');
  await ensureToken();
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise((r) => gapi.load('picker', r));
  return new Promise((resolve) => {
    const P = google.picker;
    const view = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setMimeTypes(views.map(v => v === 'image' ? 'image/png,image/jpeg,image/webp,image/gif' : v === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'audio/mpeg,audio/mp4,audio/wav,audio/ogg').join(','));
    let b = new P.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(cfg.apiKey).setLocale('ar').setTitle('اختر من Google Drive')
      .setCallback((d) => { if (d.action === P.Action.PICKED) resolve(d.docs.map(x => ({ id: x.id, name: x.name, mimeType: x.mimeType }))); else if (d.action === P.Action.CANCEL) resolve([]); });
    if (cfg.appId) b = b.setAppId(cfg.appId);
    if (multiple) b = b.enableFeature(P.Feature.MULTISELECT_ENABLED);
    b.build().setVisible(true);
  });
}
