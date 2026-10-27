import { planSvg } from './plan.js?v=9';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  rooms: [],
  updated: null,
  units: safeGet('units') || 'in',
  key: safeGet('editKey') || '',
  editing: false,
  lightbox: null,
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } }

// ---------- lengths ----------

const FRACTIONS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];
const NUM = String.raw`(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)`;
const RE_FT_IN = new RegExp(`^${NUM}\\s*(?:'|ft\\.?|feet|foot)\\s*(?:${NUM}\\s*(?:"|in\\.?|inches|inch)?)?$`);
const RE_IN = new RegExp(`^${NUM}\\s*(?:"|in\\.?|inches|inch)?$`);
const RE_METRIC = /^(\d+(?:\.\d+)?)\s*(mm|cm|m|millimeters?|centimeters?|meters?)$/;

function toNumber(text) {
  return text.trim().split(/\s+/).reduce((sum, part) => {
    if (part.includes('/')) { const [a, b] = part.split('/'); return sum + Number(a) / Number(b); }
    return sum + Number(part);
  }, 0);
}

export function parseLength(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase().replace(/[″”“]/g, '"').replace(/[′’‘]/g, "'");
  if (!s) return null;
  let m;
  if ((m = s.match(RE_METRIC))) {
    const v = Number(m[1]);
    if (m[2].startsWith('mm') || m[2].startsWith('milli')) return v / 25.4;
    if (m[2].startsWith('cm') || m[2].startsWith('centi')) return v / 2.54;
    return (v * 100) / 2.54;
  }
  if ((m = s.match(RE_FT_IN))) return toNumber(m[1]) * 12 + (m[2] ? toNumber(m[2]) : 0);
  if ((m = s.match(RE_IN))) return toNumber(m[1]);
  return null;
}

export function formatLength(inches, units = state.units) {
  if (inches == null || !Number.isFinite(inches)) return null;
  if (units === 'cm') {
    const cm = Math.round(inches * 2.54 * 2) / 2;
    return { main: `${cm} cm`, sub: inchesText(inches) };
  }
  const eighths = Math.round(inches * 8);
  const ft = Math.floor(eighths / 96);
  const rem = eighths - ft * 96;
  const whole = Math.floor(rem / 8);
  const frac = FRACTIONS[rem % 8];
  const inchPart = whole === 0 && frac ? `${frac}″` : `${whole}${frac}″`;
  const main = ft ? `${ft}′ ${inchPart}` : inchPart;
  return { main, sub: ft ? inchesText(inches) : '' };
}

function inchesText(inches) {
  const v = Math.round(inches * 8) / 8;
  return `${v} in`;
}

// ---------- API ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', body, form, retried = false } = {}) {
  const headers = {};
  if (state.key) headers.authorization = `Bearer ${state.key}`;
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

// ---------- rendering ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function roomById(id) { return state.rooms.find((r) => r.id === id); }
function measurementById(id) {
  for (const r of state.rooms) { const m = r.measurements.find((x) => x.id === id); if (m) return { room: r, m }; }
  return null;
}
function photoById(id) {
  for (const r of state.rooms) { const p = r.photos.find((x) => x.id === id); if (p) return { room: r, p }; }
  return null;
}

function hasValue(m) { return m.inches != null || (m.raw && m.raw.trim() !== ''); }

function renderPlans() {
  $('#plan-1').insertAdjacentHTML('beforeend', planSvg(1));
  $('#plan-2').insertAdjacentHTML('beforeend', planSvg(2));
  $('.plans').addEventListener('click', (e) => {
    const el = e.target.closest('[data-room]');
    if (el) openRoom(el.dataset.room);
  });
}

function renderRooms() {
  const openIds = new Set($$('details.room-card[open]').map((d) => d.dataset.room));
  const floors = [[1, 'Downstairs'], [2, 'Upstairs']];
  $('#rooms').innerHTML = floors.map(([floor, title]) =>
    `<h2 class="floor-h">${title}</h2>` +
    state.rooms.filter((r) => r.floor === floor).map((r) => roomCard(r, openIds.has(r.id))).join(''),
  ).join('');
}

function summaryMeta(room) {
  const measured = room.measurements.filter(hasValue).length;
  const parts = [`${measured} of ${room.measurements.length} measured`];
  if (room.photos.length) parts.push(`${room.photos.length} photo${room.photos.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function roomCard(room, open) {
  return `<details class="room-card" id="room-${room.id}" data-room="${room.id}"${open ? ' open' : ''}>
    <summary><span class="name">${esc(room.name)}</span><span class="meta">${summaryMeta(room)}</span></summary>
    <div class="body">
      ${room.blurb ? `<p class="blurb">${esc(room.blurb)}</p>` : ''}
      ${state.editing ? `<div class="edit-tools"><label class="add-photo">Add photos<input type="file" accept="image/*" multiple data-upload="${room.id}"></label><button type="button" class="add-measure" data-add="${room.id}">+ Add a measurement</button></div>` : ''}
      <div class="measurements">${room.measurements.map(measurementRow).join('')}</div>
      <div class="photos">${room.photos.map(photoFigure).join('')}</div>
      ${notesBlock(room)}
    </div>
  </details>`;
}

function measurementRow(m) {
  if (state.editing) {
    const parsed = formatLength(parseLength(m.raw));
    return `<div class="m edit" data-id="${m.id}">
      <input class="label" value="${esc(m.label)}" aria-label="Label" maxlength="120">
      <span class="value"><input class="raw" value="${esc(m.raw || (m.inches != null ? String(m.inches) : ''))}" placeholder="e.g. 8' 6&quot;" aria-label="Measurement" maxlength="60" autocomplete="off"><small class="parsed">${parsed ? `= ${parsed.main}` : ''}</small></span>
      <input class="note" value="${esc(m.note)}" placeholder="Note" aria-label="Note" maxlength="500">
      <button type="button" class="del" aria-label="Delete this measurement">✕</button>
    </div>`;
  }
  const f = formatLength(m.inches);
  const value = f
    ? `<span class="value"><b>${f.main}</b>${f.sub ? `<small>${f.sub}</small>` : ''}</span>`
    : m.raw ? `<span class="value"><b>${esc(m.raw)}</b></span>` : `<span class="value empty">—</span>`;
  return `<div class="m" data-id="${m.id}"><span class="label">${esc(m.label)}</span>${value}${m.note ? `<span class="note">${esc(m.note)}</span>` : ''}</div>`;
}

function photoFigure(p) {
  const cap = state.editing
    ? `<input class="caption" value="${esc(p.caption)}" placeholder="Caption" maxlength="300" aria-label="Caption">`
    : (p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : '');
  return `<figure class="photo" data-id="${p.id}">
    <img src="/photos/${p.id}/thumb.jpg" alt="${esc(p.caption || 'Photo')}" loading="lazy" width="${p.width || 4}" height="${p.height || 3}">
    ${state.editing ? '<button type="button" class="del" aria-label="Delete photo">✕</button>' : ''}${cap}
  </figure>`;
}

function notesBlock(room) {
  if (state.editing) return `<div class="notes"><h4>Notes</h4><textarea data-notes="${room.id}" placeholder="Anything else about this room" maxlength="4000">${esc(room.notes)}</textarea></div>`;
  if (!room.notes) return '';
  return `<div class="notes"><h4>Notes</h4><p>${esc(room.notes)}</p></div>`;
}

function renderFooter() {
  const el = $('#updated');
  if (state.updated) {
    const d = new Date(state.updated);
    el.textContent = `Updated ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ·`;
  } else el.textContent = 'Nothing measured yet ·';
  $('#edit-toggle').textContent = state.editing ? 'Stop editing' : 'Edit';
}

function refreshSummary(roomId) {
  const room = roomById(roomId);
  const el = $(`#room-${roomId} summary .meta`);
  if (room && el) el.textContent = summaryMeta(room);
}

function openRoom(id) {
  const card = $(`#room-${id}`);
  if (!card) return;
  card.open = true;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1200);
  $$('.plans .room.selected').forEach((r) => r.classList.remove('selected'));
  $$(`.plans [data-room="${id}"]`).forEach((r) => r.classList.add('selected'));
}

// ---------- toast ----------

let toastTimer;
function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function flash(el) {
  if (!el) return;
  el.classList.remove('saved');
  void el.offsetWidth;
  el.classList.add('saved');
}

// ---------- editing ----------

async function startEditing() {
  let key = state.key;
  if (!key) {
    key = window.prompt('Edit passphrase');
    if (!key) return;
  }
  state.key = key.trim();
  try {
    await api('/auth', { method: 'POST' });
  } catch {
    state.key = '';
    safeSet('editKey', null);
    toast('That passphrase was not accepted');
    return;
  }
  safeSet('editKey', state.key);
  safeSet('editing', '1');
  state.editing = true;
  document.body.classList.add('editing');
  $('#editbar').hidden = false;
  renderRooms();
  renderFooter();
}

function stopEditing(expired = false) {
  if (!state.editing) return;
  state.editing = false;
  safeSet('editing', null);
  document.body.classList.remove('editing');
  $('#editbar').hidden = true;
  if (expired) { state.key = ''; safeSet('editKey', null); toast('Edit session ended. Enter the passphrase again to keep editing.'); }
  renderRooms();
  renderFooter();
}

async function saveMeasurement(row) {
  const id = Number(row.dataset.id);
  const found = measurementById(id);
  if (!found) return;
  const label = $('.label', row).value;
  const raw = $('.raw', row).value;
  const note = $('.note', row).value;
  const inches = parseLength(raw);
  if (label === found.m.label && raw === found.m.raw && note === found.m.note && inches === found.m.inches) return;
  try {
    const saved = await api(`/measurements/${id}`, { method: 'PUT', body: { label, raw, inches, note } });
    Object.assign(found.m, saved);
    refreshSummary(found.room.id);
    flash(row);
  } catch (err) {
    toast(err.message);
  }
}

async function addMeasurement(roomId) {
  const room = roomById(roomId);
  if (!room) return;
  let n = room.measurements.length + 1;
  let label = `Measurement ${n}`;
  while (room.measurements.some((m) => m.label === label)) label = `Measurement ${++n}`;
  try {
    const m = await api(`/rooms/${roomId}/measurements`, { method: 'POST', body: { label } });
    room.measurements.push(m);
    const list = $(`#room-${roomId} .measurements`);
    list.insertAdjacentHTML('beforeend', measurementRow(m));
    refreshSummary(roomId);
    const input = $(`.m[data-id="${m.id}"] .label`, list);
    input.focus();
    input.select();
  } catch (err) {
    toast(err.message);
  }
}

async function deleteMeasurement(row) {
  const id = Number(row.dataset.id);
  const found = measurementById(id);
  if (!found) return;
  if (hasValue(found.m) && !window.confirm(`Delete "${found.m.label}"?`)) return;
  try {
    await api(`/measurements/${id}`, { method: 'DELETE' });
    found.room.measurements = found.room.measurements.filter((m) => m.id !== id);
    row.remove();
    refreshSummary(found.room.id);
  } catch (err) {
    toast(err.message);
  }
}

async function saveNotes(roomId, value) {
  const room = roomById(roomId);
  if (!room || room.notes === value) return;
  try {
    const saved = await api(`/rooms/${roomId}`, { method: 'PUT', body: { notes: value } });
    room.notes = saved.notes;
    flash($(`#room-${roomId} .notes`));
  } catch (err) {
    toast(err.message);
  }
}

async function saveCaption(fig, value) {
  const found = photoById(fig.dataset.id);
  if (!found || found.p.caption === value) return;
  try {
    const saved = await api(`/photos/${found.p.id}`, { method: 'PUT', body: { caption: value } });
    found.p.caption = saved.caption;
    flash(fig);
  } catch (err) {
    toast(err.message);
  }
}

async function deletePhoto(fig) {
  const found = photoById(fig.dataset.id);
  if (!found) return;
  if (!window.confirm('Delete this photo?')) return;
  try {
    await api(`/photos/${found.p.id}`, { method: 'DELETE' });
    found.room.photos = found.room.photos.filter((p) => p.id !== found.p.id);
    fig.remove();
    refreshSummary(found.room.id);
  } catch (err) {
    toast(err.message);
  }
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

async function uploadPhotos(roomId, files) {
  const room = roomById(roomId);
  if (!room || !files.length) return;
  const grid = $(`#room-${roomId} .photos`);
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
      const p = await api(`/rooms/${roomId}/photos`, { method: 'POST', form });
      room.photos.push(p);
      grid.insertAdjacentHTML('beforeend', photoFigure(p));
      done++;
    } catch (err) {
      toast(`${file.name}: ${err.message}`, 5000);
      return;
    }
  }
  refreshSummary(roomId);
  toast(done === 1 ? 'Photo added' : `${done} photos added`);
  const first = $(`#room-${roomId} .photo:nth-last-child(${done}) input.caption`);
  if (first) first.focus();
}

// ---------- lightbox ----------

function showLightbox(roomId, index) {
  const room = roomById(roomId);
  if (!room || !room.photos.length) return;
  const i = (index + room.photos.length) % room.photos.length;
  state.lightbox = { roomId, index: i };
  const p = room.photos[i];
  const lb = $('#lightbox');
  $('img', lb).src = `/photos/${p.id}/full.jpg`;
  $('img', lb).alt = p.caption || 'Photo';
  $('.cap', lb).textContent = p.caption ? `${p.caption} · ${room.name}` : `${room.name} · ${i + 1} of ${room.photos.length}`;
  $('.prev', lb).hidden = $('.next', lb).hidden = room.photos.length < 2;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
  state.lightbox = null;
}

function stepLightbox(delta) {
  if (!state.lightbox) return;
  showLightbox(state.lightbox.roomId, state.lightbox.index + delta);
}

// ---------- copy as text ----------

function asText() {
  const lines = ['The Apartment, measurements'];
  if (state.updated) lines.push(`as of ${new Date(state.updated).toLocaleDateString()}`);
  for (const [floor, title] of [[1, 'DOWNSTAIRS'], [2, 'UPSTAIRS']]) {
    lines.push('', title);
    for (const room of state.rooms.filter((r) => r.floor === floor)) {
      lines.push('', room.name);
      for (const m of room.measurements) {
        const f = formatLength(m.inches);
        const v = f ? (f.sub ? `${f.main} (${f.sub})` : f.main) : (m.raw || '—');
        lines.push(`  ${m.label}: ${v}${m.note ? `  [${m.note}]` : ''}`);
      }
      if (room.notes) lines.push(`  Notes: ${room.notes}`);
    }
  }
  return lines.join('\n');
}

async function copyAll() {
  const text = asText();
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it anywhere.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied. Paste it anywhere.');
  }
}

// ---------- wiring ----------

function wire() {
  const units = $('#units');
  units.value = state.units;
  units.addEventListener('change', () => { state.units = units.value; safeSet('units', state.units); renderRooms(); });

  $('#copy').addEventListener('click', copyAll);
  $('#edit-toggle').addEventListener('click', () => (state.editing ? stopEditing() : startEditing()));
  $('#edit-done').addEventListener('click', () => stopEditing());

  const rooms = $('#rooms');
  document.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea')) $('#editbar').classList.add('typing'); });
  document.addEventListener('focusout', () => $('#editbar').classList.remove('typing'));

  rooms.addEventListener('change', (e) => {
    const t = e.target;
    const row = t.closest('.m.edit');
    if (row && (t.classList.contains('label') || t.classList.contains('raw') || t.classList.contains('note'))) return saveMeasurement(row);
    if (t.matches('input[data-upload]')) { const files = [...t.files]; t.value = ''; return uploadPhotos(t.dataset.upload, files); }
    if (t.matches('input.caption')) return saveCaption(t.closest('.photo'), t.value);
    if (t.matches('textarea[data-notes]')) return saveNotes(t.dataset.notes, t.value);
  });

  rooms.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('.m.edit .raw')) {
      const f = formatLength(parseLength(t.value));
      $('.parsed', t.parentElement).textContent = f ? `= ${f.main}` : (t.value.trim() ? 'saved as text' : '');
    }
  });

  rooms.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.m.edit input, input.caption')) { e.preventDefault(); e.target.blur(); }
  });

  rooms.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-add]')) return addMeasurement(t.dataset.add);
    if (t.matches('.m.edit .del')) return deleteMeasurement(t.closest('.m'));
    if (t.matches('.photo .del')) return deletePhoto(t.closest('.photo'));
    if (t.matches('.photo img')) {
      const fig = t.closest('.photo');
      const roomId = fig.closest('details').dataset.room;
      const room = roomById(roomId);
      return showLightbox(roomId, room.photos.findIndex((p) => p.id === fig.dataset.id));
    }
  });

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

async function load() {
  try {
    const data = await api('/state');
    state.rooms = data.rooms;
    state.updated = data.updated;
    renderRooms();
    renderFooter();
    if (location.hash.startsWith('#room-')) openRoom(location.hash.slice(6));
    if (safeGet('editing') === '1' && state.key) await startEditing();
  } catch (err) {
    $('#rooms').innerHTML = `<p class="loading">Could not load: ${esc(err.message)}</p>`;
  }
}

renderPlans();
wire();
load();
