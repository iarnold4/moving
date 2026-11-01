// Shared by the Apartment page (app.js) and the Boxes page (boxes.js): DOM helpers, the API
// client and edit session, toasts, photo upload and the lightbox. Both pages have the same
// footer, edit bar, lightbox and toast markup.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function safeSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } }

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- edit session ----------
// The passphrase and the editing flag persist in localStorage, so a phone keeps editing
// across reloads and across the two pages.

export const session = {
  key: safeGet('editKey') || '',
  editing: false,
};

// ---------- API ----------

export async function api(path, { method = 'GET', body, form, retried = false } = {}) {
  const headers = {};
  if (session.key) headers.authorization = `Bearer ${session.key}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth' && !retried) { await sleep(800); return api(path, { method, body, form, retried: true }); }
  if (res.status === 401 && path !== '/auth') throw new Error('Passphrase not accepted. Tap Done, then Edit, and enter it again.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- toast ----------

let toastTimer;
export function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function flash(el) {
  if (!el) return;
  el.classList.remove('saved');
  void el.offsetWidth;
  el.classList.add('saved');
}

// ---------- editing ----------
// render is the page's "redraw everything" function; it runs after the mode flips.

let render = () => {};

export async function startEditing() {
  let key = session.key;
  if (!key) {
    key = window.prompt('Edit passphrase');
    if (!key) return;
  }
  session.key = key.trim();
  try {
    await api('/auth', { method: 'POST' });
  } catch {
    session.key = '';
    safeSet('editKey', null);
    toast('That passphrase was not accepted');
    return;
  }
  safeSet('editKey', session.key);
  safeSet('editing', '1');
  session.editing = true;
  document.body.classList.add('editing');
  $('#editbar').hidden = false;
  render();
}

export function stopEditing(expired = false) {
  if (!session.editing) return;
  session.editing = false;
  safeSet('editing', null);
  document.body.classList.remove('editing');
  $('#editbar').hidden = true;
  if (expired) { session.key = ''; safeSet('editKey', null); toast('Edit session ended. Enter the passphrase again to keep editing.'); }
  render();
}

// Wires the Edit and Done buttons and hides the edit bar while typing. Once per page.
export function setupEditing(rerender) {
  render = rerender;
  $('#edit-toggle').addEventListener('click', () => (session.editing ? stopEditing() : startEditing()));
  $('#edit-done').addEventListener('click', () => stopEditing());
  document.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea')) $('#editbar').classList.add('typing'); });
  document.addEventListener('focusout', () => $('#editbar').classList.remove('typing'));
}

// Picks editing back up after a reload or a page change if it was on and the key is known.
export async function resumeEditing() {
  if (safeGet('editing') === '1' && session.key) await startEditing();
}

export function footerText(updated, empty) {
  if (!updated) return `${empty} ·`;
  const d = new Date(updated);
  return `Updated ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ·`;
}

// ---------- copy as text ----------

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copied. Paste it anywhere.');
}

// ---------- photos ----------

export function photoFigure(p) {
  const cap = session.editing
    ? `<input class="caption" value="${esc(p.caption)}" placeholder="Caption" maxlength="300" aria-label="Caption">`
    : (p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : '');
  return `<figure class="photo" data-id="${p.id}">
    <img src="/photos/${p.id}/thumb.jpg" alt="${esc(p.caption || 'Photo')}" loading="lazy" width="${p.width || 4}" height="${p.height || 3}">
    ${session.editing ? '<button type="button" class="del" aria-label="Delete photo">✕</button>' : ''}${cap}
  </figure>`;
}

// Resize in the browser so phone photos don't upload at 5 MB each.
// Goes through an <img> (not createImageBitmap) so EXIF rotation is honored everywhere.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image the browser can read')); };
    img.src = url;
  });
}

function scaled(img, max, quality) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error('Could not encode the image'))), 'image/jpeg', quality);
  });
}

// Posts each file to `path` (e.g. /rooms/office/photos) as a full and a thumb JPEG, calling
// onUploaded(row) after each so the page can show it right away. Stops at the first failure.
// Returns how many went up.
export async function uploadPhotos(path, files, onUploaded) {
  let done = 0;
  for (const file of files) {
    toast(`Uploading ${done + 1} of ${files.length}…`, 60000);
    try {
      const img = await loadImage(file);
      const [full, thumb] = await Promise.all([scaled(img, 1800, 0.85), scaled(img, 640, 0.8)]);
      const form = new FormData();
      form.append('full', full.blob, 'full.jpg');
      form.append('thumb', thumb.blob, 'thumb.jpg');
      form.append('width', String(full.width));
      form.append('height', String(full.height));
      form.append('caption', '');
      const p = await api(path, { method: 'POST', form });
      onUploaded(p);
      done++;
    } catch (err) {
      toast(`${file.name}: ${err.message}`, 5000);
      return done;
    }
  }
  toast(done === 1 ? 'Photo added' : `${done} photos added`);
  return done;
}

// ---------- lightbox ----------
// showLightbox(list, index, title): list is an array of photo rows, title says where they
// are from ("Office", "Box 14").

let lightbox = null;

export function showLightbox(list, index, title) {
  if (!list.length) return;
  const i = (index + list.length) % list.length;
  lightbox = { list, index: i, title };
  const p = list[i];
  const lb = $('#lightbox');
  $('img', lb).src = `/photos/${p.id}/full.jpg`;
  $('img', lb).alt = p.caption || 'Photo';
  $('.cap', lb).textContent = p.caption ? `${p.caption} · ${title}` : `${title} · ${i + 1} of ${list.length}`;
  $('.prev', lb).hidden = $('.next', lb).hidden = list.length < 2;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
  lightbox = null;
}

function stepLightbox(delta) {
  if (!lightbox) return;
  showLightbox(lightbox.list, lightbox.index + delta, lightbox.title);
}

export function setupLightbox() {
  const lb = $('#lightbox');
  $('.close', lb).addEventListener('click', closeLightbox);
  $('.prev', lb).addEventListener('click', () => stepLightbox(-1));
  $('.next', lb).addEventListener('click', () => stepLightbox(1));
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });
  let touchX = null;
  lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1);
  });
}
