// Boxes page: every box, its number, where it goes, what is in it and whether it has
// arrived. Shares the API client, edit session, photos and lightbox with the Apartment
// page through common.js.
import { $, $$, esc, session, api, toast, flash, setupEditing, resumeEditing, footerText, copyText, photoFigure, uploadPhotos, showLightbox, setupLightbox } from './common.js?v=1';

const STATUSES = [['packed', 'Packed'], ['moved', 'In the apartment'], ['unpacked', 'Unpacked']];
const statusName = (id) => (STATUSES.find(([s]) => s === id) || STATUSES[0])[1];
const NO_ROOM = { id: '', name: 'No room yet' };

const state = { rooms: [], boxes: [], updated: null, query: '' };

const roomById = (id) => state.rooms.find((r) => r.id === id);
const boxById = (id) => state.boxes.find((b) => b.id === id);
const items = (b) => b.contents.split('\n').map((s) => s.trim()).filter(Boolean);
const destinations = () => state.rooms.filter((r) => r.floor !== 3);          // not the Furniture pseudo-room
const groups = () => [...destinations(), NO_ROOM];
const inGroup = (room) => state.boxes.filter((b) => (b.room_id || '') === room.id).sort((a, b) => a.id - b.id);
function photoById(id) {
  for (const b of state.boxes) { const p = b.photos.find((x) => x.id === id); if (p) return { box: b, p }; }
  return null;
}

// ---------- rendering ----------

function matches(b, q) {
  if (!q) return true;
  const hay = [b.id, b.contents, roomById(b.room_id)?.name, statusName(b.status), b.fragile ? 'fragile' : '', b.open_first ? 'open first' : '']
    .join('\n').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function render() { renderProgress(); renderBoxes(); renderFooter(); }

function renderProgress() {
  const n = state.boxes.length;
  if (!n) { $('#progress').textContent = ''; return; }
  const here = state.boxes.filter((b) => b.status !== 'packed').length;
  const unpacked = state.boxes.filter((b) => b.status === 'unpacked').length;
  $('#progress').textContent = `${here} of ${n} box${n === 1 ? '' : 'es'} in the apartment · ${unpacked} unpacked`;
}

// Groups are open unless someone closed them; a search opens whatever it finds.
function renderBoxes() {
  const q = state.query.trim().toLowerCase();
  const closed = new Set($$('#boxes details:not([open])').map((d) => d.dataset.group));
  const html = groups().map((room) => {
    const list = inGroup(room).filter((b) => matches(b, q));
    if (!list.length) return '';
    const open = q || !closed.has(room.id);
    return `<details class="room-card" id="room-${room.id || 'none'}" data-group="${room.id}"${open ? ' open' : ''}>
      <summary><span class="name">${esc(room.name)}</span><span class="meta">${groupMeta(list)}</span></summary>
      <div class="body boxes">${list.map(boxCard).join('')}</div>
    </details>`;
  }).join('');
  const empty = q ? 'Nothing matches.' : session.editing ? 'No boxes yet. Tap “+ New box” to start.' : 'No boxes yet.';
  $('#boxes').innerHTML = html || `<p class="loading">${empty}</p>`;
}

function groupMeta(list) {
  const parts = [`${list.length} box${list.length === 1 ? '' : 'es'}`];
  const here = list.filter((b) => b.status !== 'packed').length;
  if (here) parts.push(`${here} here`);
  const fragile = list.filter((b) => b.fragile).length;
  if (fragile) parts.push(`${fragile} fragile`);
  return parts.join(' · ');
}

const flags = (b) => (b.fragile ? '<span class="flag fragile">Fragile</span>' : '') + (b.open_first ? '<span class="flag first">Open first</span>' : '');

function boxCard(b) {
  if (session.editing) return boxEditor(b);
  const list = items(b);
  return `<article class="box" id="box-${b.id}" data-id="${b.id}">
    <div class="box-head"><span class="num">${b.id}</span><span class="flags">${flags(b)}</span><span class="status s-${b.status}">${statusName(b.status)}</span></div>
    ${list.length ? `<ul class="contents">${list.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '<p class="empty">Nothing listed yet</p>'}
    <div class="photos">${b.photos.map(photoFigure).join('')}</div>
  </article>`;
}

function boxEditor(b) {
  const options = destinations().map((r) => `<option value="${r.id}"${r.id === b.room_id ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
  return `<article class="box edit" id="box-${b.id}" data-id="${b.id}">
    <div class="box-head">
      <label class="numlab">#<input class="num-in" type="number" min="1" step="1" inputmode="numeric" value="${b.id}" aria-label="Box number"></label>
      <select class="room-in" aria-label="Destination room"><option value="">No room yet</option>${options}</select>
      <button type="button" class="del" aria-label="Delete this box">✕</button>
    </div>
    <textarea class="contents-in" placeholder="What's inside, one thing per line" maxlength="4000" aria-label="Contents">${esc(b.contents)}</textarea>
    <div class="box-opts">
      <div class="seg" role="group" aria-label="Status">${STATUSES.map(([id, name]) => `<button type="button" data-status="${id}" aria-pressed="${b.status === id}">${name}</button>`).join('')}</div>
      <label><input type="checkbox" class="fragile-in"${b.fragile ? ' checked' : ''}> Fragile</label>
      <label><input type="checkbox" class="first-in"${b.open_first ? ' checked' : ''}> Open first</label>
      <label class="add-photo">Add photos<input type="file" accept="image/*" multiple data-upload="${b.id}"></label>
    </div>
    <div class="photos">${b.photos.map(photoFigure).join('')}</div>
  </article>`;
}

function renderFooter() {
  $('#updated').textContent = footerText(state.updated, 'No boxes yet');
  $('#edit-toggle').textContent = session.editing ? 'Stop editing' : 'Edit';
}

function refreshGroup(card) {
  const det = card?.closest('details');
  if (!det) return;
  const room = det.dataset.group ? roomById(det.dataset.group) : NO_ROOM;
  $('summary .meta', det).textContent = groupMeta(inGroup(room));
}

function reveal(id) {
  const card = $(`#box-${id}`);
  if (!card) return;
  const det = card.closest('details');
  if (det) det.open = true;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 1200);
}

// ---------- editing ----------

async function addBox() {
  try {
    const b = await api('/boxes', { method: 'POST', body: {} });
    state.boxes.push(b);
    renderProgress();
    renderBoxes();
    reveal(b.id);
    $(`#box-${b.id} .contents-in`)?.focus();
  } catch (err) {
    toast(err.message);
  }
}

async function saveBox(card, patch) {
  const id = Number(card.dataset.id);
  const b = boxById(id);
  if (!b || Object.entries(patch).every(([k, v]) => b[k] === v)) return;
  try {
    const saved = await api(`/boxes/${id}`, { method: 'PUT', body: patch });
    Object.assign(b, saved);
    if ('id' in patch || 'room_id' in patch) {            // the card moves: redraw and follow it
      renderBoxes();
      reveal(b.id);
    } else {
      $$('[data-status]', card).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.status === b.status)));
      flash(card);
    }
    refreshGroup($(`#box-${b.id}`));
    renderProgress();
  } catch (err) {
    toast(err.message);
    if ('id' in patch) $('.num-in', card).value = b.id;
  }
}

async function deleteBox(card) {
  const b = boxById(Number(card.dataset.id));
  if (!b) return;
  if ((items(b).length || b.photos.length) && !window.confirm(`Delete box ${b.id} and its photos?`)) return;
  try {
    await api(`/boxes/${b.id}`, { method: 'DELETE' });
    state.boxes = state.boxes.filter((x) => x.id !== b.id);
    renderProgress();
    renderBoxes();
  } catch (err) {
    toast(err.message);
  }
}

async function uploadBoxPhotos(boxId, files) {
  const b = boxById(boxId);
  if (!b || !files.length) return;
  const grid = $(`#box-${boxId} .photos`);
  const done = await uploadPhotos(`/boxes/${boxId}/photos`, files, (p) => {
    b.photos.push(p);
    grid.insertAdjacentHTML('beforeend', photoFigure(p));
  });
  if (done) $(`#box-${boxId} .photo:nth-last-child(${done}) input.caption`)?.focus();
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
  if (!found || !window.confirm('Delete this photo?')) return;
  try {
    await api(`/photos/${found.p.id}`, { method: 'DELETE' });
    found.box.photos = found.box.photos.filter((p) => p.id !== found.p.id);
    fig.remove();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- copy as text ----------

function asText() {
  const lines = ['Moving boxes'];
  if (state.updated) lines.push(`as of ${new Date(state.updated).toLocaleDateString()}`);
  for (const room of groups()) {
    const list = inGroup(room);
    if (!list.length) continue;
    lines.push('', room.name.toUpperCase());
    for (const b of list) {
      const tags = [statusName(b.status), b.fragile ? 'fragile' : '', b.open_first ? 'open first' : ''].filter(Boolean).join(', ');
      lines.push(`Box ${b.id} (${tags})`);
      for (const s of items(b)) lines.push(`  - ${s}`);
    }
  }
  return lines.join('\n');
}

// ---------- wiring ----------

function wire() {
  setupEditing(render);
  setupLightbox();
  $('#copy').addEventListener('click', () => copyText(asText()));
  $('#add-box').addEventListener('click', addBox);
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderBoxes(); });

  const root = $('#boxes');
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[data-upload]')) { const files = [...t.files]; t.value = ''; return uploadBoxPhotos(Number(t.dataset.upload), files); }
    if (t.matches('input.caption')) return saveCaption(t.closest('.photo'), t.value);
    const card = t.closest('.box.edit');
    if (!card) return;
    if (t.matches('.num-in')) {
      const n = Number(t.value);
      if (!Number.isInteger(n) || n < 1) { t.value = card.dataset.id; return toast('Box numbers are whole numbers from 1 up'); }
      return saveBox(card, { id: n });
    }
    if (t.matches('.room-in')) return saveBox(card, { room_id: t.value || null });
    if (t.matches('.contents-in')) return saveBox(card, { contents: t.value });
    if (t.matches('.fragile-in')) return saveBox(card, { fragile: t.checked ? 1 : 0 });
    if (t.matches('.first-in')) return saveBox(card, { open_first: t.checked ? 1 : 0 });
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-status]')) return saveBox(t.closest('.box'), { status: t.dataset.status });
    if (t.matches('.photo .del')) return deletePhoto(t.closest('.photo'));
    if (t.matches('.box.edit > .box-head .del')) return deleteBox(t.closest('.box'));
    if (t.matches('.photo img')) {
      const fig = t.closest('.photo');
      const b = boxById(Number(fig.closest('.box').dataset.id));
      return showLightbox(b.photos, b.photos.findIndex((p) => p.id === fig.dataset.id), `Box ${b.id}`);
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.num-in, input.caption')) { e.preventDefault(); e.target.blur(); }
  });
}

async function load() {
  try {
    const data = await api('/state');
    state.rooms = data.rooms;
    state.boxes = data.boxes || [];
    state.updated = data.updated;
    render();
    await resumeEditing();
    jumpToHash();
  } catch (err) {
    $('#boxes').innerHTML = `<p class="loading">Could not load: ${esc(err.message)}</p>`;
  }
}

// /boxes#room-office opens that room's group; /boxes#box-14 scrolls to the box.
function jumpToHash() {
  const h = location.hash.slice(1);
  if (!h) return;
  if (h.startsWith('box-')) return reveal(Number(h.slice(4)));
  const det = document.getElementById(h);
  if (!det) return;
  det.open = true;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  det.classList.add('flash');
  setTimeout(() => det.classList.remove('flash'), 1200);
}

wire();
load();
