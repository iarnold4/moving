import { planSvg, LAYOUTS, chosen } from './plan.js?v=16';
import {
  $, $$, safeGet, safeSet, esc, session, api, toast, flash, setupEditing, resumeEditing, footerText, copyText,
  photoFigure, uploadPhotos, showLightbox, setupLightbox,
} from './common.js?v=1';

const state = {
  rooms: [],
  boxes: [],
  updated: null,
  units: safeGet('units') || 'in',
  layouts: layoutsFromUrl(),
};

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

// ---------- rendering ----------

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
  for (const floor of [1, 2]) {
    $(`#plan-${floor}`).insertAdjacentHTML('beforeend', planSvg(floor, state.layouts) +
      `<div class="chooser" hidden>
        <div class="chooser-head"><span class="chooser-name"></span><button type="button" class="link" data-open="">Measurements &amp; photos</button><button type="button" class="chooser-close" aria-label="Close">×</button></div>
        <div class="chooser-opts" role="group" aria-label="Layouts"></div>
        <p class="chooser-note"></p>
      </div>`);
  }
  $('.plans').addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-layout]')) { const [room, id] = t.dataset.layout.split(':'); return setLayout(room, id); }
    if (t.matches('[data-open]')) return openRoom(t.dataset.open);
    if (t.matches('.chooser-close')) return closeChoosers();
    const el = t.closest('[data-room]');
    if (!el) return;
    const lr = layoutRoom(el.dataset.room);
    return lr ? openChooser(lr) : openRoom(el.dataset.room);
  });
}

// ---------- layouts ----------
// Rooms in LAYOUTS have more than one furniture arrangement. Tapping one opens a chooser
// under its plan instead of its card. The choice lives in the URL (?office=floating&bed2=north)
// so a link opens on a particular combination. A room named in another room's `also` (the
// nook, which the dining layouts reach into) opens that room's chooser instead of a card.

const layoutRoom = (id) => (LAYOUTS[id] ? id : Object.keys(LAYOUTS).find((k) => LAYOUTS[k].also?.includes(id)));

function layoutsFromUrl() {
  const q = new URLSearchParams(location.search);
  const out = {};
  for (const [room, def] of Object.entries(LAYOUTS)) {
    const id = q.get(room);
    if (def.options.some((o) => o.id === id)) out[room] = id;
  }
  return out;
}

function syncUrl() {
  const q = new URLSearchParams();
  for (const [room, id] of Object.entries(state.layouts)) if (id !== LAYOUTS[room].options[0].id) q.set(room, id);
  const s = q.toString();
  history.replaceState(null, '', `${location.pathname}${s ? `?${s}` : ''}${location.hash}`);
}

function selectOnPlan(id) {
  $$('.plans svg .selected').forEach((r) => r.classList.remove('selected'));
  for (const room of [id, ...(LAYOUTS[id]?.also || [])]) {
    $$(`.plans svg [data-room="${room}"]`).forEach((r) => r.classList.add('selected'));
  }
}

function openChooser(room) {
  const def = LAYOUTS[room];
  closeChoosers();
  const ch = $(`#plan-${def.floor} .chooser`);
  ch.dataset.room = room;
  $('.chooser-name', ch).textContent = roomById(room)?.name || def.name;
  $('[data-open]', ch).dataset.open = room;
  fillChooser(ch, room);
  ch.hidden = false;
  selectOnPlan(room);
}

function fillChooser(ch, room) {
  const cur = chosen(room, state.layouts);
  $('.chooser-opts', ch).innerHTML = LAYOUTS[room].options.map((o) =>
    `<button type="button" class="opt" data-layout="${room}:${o.id}" aria-pressed="${o === cur}">${esc(o.name)}</button>`).join('');
  $('.chooser-note', ch).textContent = cur.note;
}

function closeChoosers() {
  $$('.plans .chooser').forEach((ch) => { ch.hidden = true; delete ch.dataset.room; });
}

// From a room card: scroll back up to the plan and open the chooser there.
function showChooser(room) {
  openChooser(room);
  $(`#plan-${LAYOUTS[room].floor}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setLayout(room, id) {
  state.layouts[room] = id;
  syncUrl();
  const floor = LAYOUTS[room].floor;
  const fig = $(`#plan-${floor}`);
  $('svg', fig).outerHTML = planSvg(floor, state.layouts);
  selectOnPlan(room);
  const ch = $('.chooser', fig);
  if (ch.dataset.room === room) fillChooser(ch, room);
  $$(`#rooms .layout-name[data-layout-room="${room}"]`).forEach((el) => { el.textContent = chosen(room, state.layouts).name; });
}

function renderRooms() {
  const openIds = new Set($$('details.room-card[open]').map((d) => d.dataset.room));
  const floors = [[1, 'Downstairs'], [2, 'Upstairs'], [3, 'Furniture']];
  $('#rooms').innerHTML = floors.map(([floor, title]) =>
    `<h2 class="floor-h">${title}</h2>` +
    state.rooms.filter((r) => r.floor === floor).map((r) => roomCard(r, openIds.has(r.id))).join(''),
  ).join('');
}

function summaryMeta(room) {
  const measured = room.measurements.filter(hasValue).length;
  const parts = [`${measured} of ${room.measurements.length} measured`];
  if (room.photos.length) parts.push(`${room.photos.length} photo${room.photos.length === 1 ? '' : 's'}`);
  if (LAYOUTS[room.id]) parts.push(`${LAYOUTS[room.id].options.length} layouts`);
  return parts.join(' · ');
}

function roomCard(room, open) {
  return `<details class="room-card" id="room-${room.id}" data-room="${room.id}"${open ? ' open' : ''}>
    <summary><span class="name">${esc(room.name)}</span><span class="meta">${summaryMeta(room)}</span></summary>
    <div class="body">
      ${room.blurb ? `<p class="blurb">${esc(room.blurb)}</p>` : ''}
      ${layoutsLine(room)}
      ${boxesLine(room)}
      ${session.editing ? `<div class="edit-tools"><label class="add-photo">Add photos<input type="file" accept="image/*" multiple data-upload="${room.id}"></label><button type="button" class="add-measure" data-add="${room.id}">+ Add a measurement</button></div>` : ''}
      <div class="measurements">${room.measurements.map(measurementRow).join('')}</div>
      <div class="photos">${room.photos.map(photoFigure).join('')}</div>
      ${notesBlock(room)}
    </div>
  </details>`;
}

function measurementRow(m) {
  if (session.editing) {
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

function notesBlock(room) {
  if (session.editing) return `<div class="notes"><h4>Notes</h4><textarea data-notes="${room.id}" placeholder="Anything else about this room" maxlength="4000">${esc(room.notes)}</textarea></div>`;
  if (!room.notes) return '';
  return `<div class="notes"><h4>Notes</h4><p>${esc(room.notes)}</p></div>`;
}

// "Layout: …" on a room with a chooser; on a room that shares one, "Dining area layout: …".
function layoutsLine(room) {
  const lr = layoutRoom(room.id);
  if (!lr) return '';
  const head = lr === room.id ? 'Layout' : `${esc(LAYOUTS[lr].name)} layout`;
  return `<p class="layouts">${head}: <span class="layout-name" data-layout-room="${lr}">${esc(chosen(lr, state.layouts).name)}</span> · <button type="button" class="link" data-choose="${lr}">Compare on the plan</button></p>`;
}

function boxesLine(room) {
  const n = state.boxes.filter((b) => b.room_id === room.id).length;
  if (!n) return '';
  return `<p class="boxline">${n} box${n === 1 ? '' : 'es'} going here · <a href="/boxes#room-${room.id}">See them</a></p>`;
}

function renderFooter() {
  $('#updated').textContent = footerText(state.updated, 'Nothing measured yet');
  $('#edit-toggle').textContent = session.editing ? 'Stop editing' : 'Edit';
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
  selectOnPlan(id);
}

// ---------- editing ----------

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

async function uploadRoomPhotos(roomId, files) {
  const room = roomById(roomId);
  if (!room || !files.length) return;
  const grid = $(`#room-${roomId} .photos`);
  const done = await uploadPhotos(`/rooms/${roomId}/photos`, files, (p) => {
    room.photos.push(p);
    grid.insertAdjacentHTML('beforeend', photoFigure(p));
  });
  if (!done) return;
  refreshSummary(roomId);
  const first = $(`#room-${roomId} .photo:nth-last-child(${done}) input.caption`);
  if (first) first.focus();
}

// ---------- copy as text ----------

function asText() {
  const lines = ['The Apartment, measurements'];
  if (state.updated) lines.push(`as of ${new Date(state.updated).toLocaleDateString()}`);
  for (const [floor, title] of [[1, 'DOWNSTAIRS'], [2, 'UPSTAIRS'], [3, 'FURNITURE']]) {
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

const copyAll = () => copyText(asText());

// ---------- wiring ----------

function wire() {
  const units = $('#units');
  units.value = state.units;
  units.addEventListener('change', () => { state.units = units.value; safeSet('units', state.units); renderRooms(); });

  $('#copy').addEventListener('click', copyAll);
  setupEditing(() => { renderRooms(); renderFooter(); });
  setupLightbox();

  const rooms = $('#rooms');

  rooms.addEventListener('change', (e) => {
    const t = e.target;
    const row = t.closest('.m.edit');
    if (row && (t.classList.contains('label') || t.classList.contains('raw') || t.classList.contains('note'))) return saveMeasurement(row);
    if (t.matches('input[data-upload]')) { const files = [...t.files]; t.value = ''; return uploadRoomPhotos(t.dataset.upload, files); }
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
    if (t.matches('[data-choose]')) return showChooser(t.dataset.choose);
    if (t.matches('[data-add]')) return addMeasurement(t.dataset.add);
    if (t.matches('.m.edit .del')) return deleteMeasurement(t.closest('.m'));
    if (t.matches('.photo .del')) return deletePhoto(t.closest('.photo'));
    if (t.matches('.photo img')) {
      const fig = t.closest('.photo');
      const roomId = fig.closest('details').dataset.room;
      const room = roomById(roomId);
      return showLightbox(room.photos, room.photos.findIndex((p) => p.id === fig.dataset.id), room.name);
    }
  });

}

async function load() {
  try {
    const data = await api('/state');
    state.rooms = data.rooms;
    state.boxes = data.boxes || [];
    state.updated = data.updated;
    renderRooms();
    renderFooter();
    if (location.hash.startsWith('#room-')) openRoom(location.hash.slice(6));
    await resumeEditing();
  } catch (err) {
    $('#rooms').innerHTML = `<p class="loading">Could not load: ${esc(err.message)}</p>`;
  }
}

renderPlans();
wire();
load();
