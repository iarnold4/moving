// moving.ikeflix.com — tiny API over D1 (measurements, boxes) and R2 (photos).
// Static files in ./public are served by the assets binding; this Worker only
// runs for /api/* and /photos/* (see run_worker_first in wrangler.jsonc).

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const LIMITS = { label: 120, raw: 60, note: 500, caption: 300, notes: 4000, contents: 4000 };
const STATUSES = ['packed', 'moved', 'unpacked'];
const PHOTO_TABLES = ['photos', 'box_photos'];   // room photos and box photos share R2 and the /photos routes

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      if (url.pathname.startsWith('/photos/')) return await servePhoto(request, env, ctx, url);
      return await env.ASSETS.fetch(request);
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', path: url.pathname, message: err.message, stack: err.stack }));
      return json({ error: 'Something went wrong on the server' }, 500);
    }
  },
};

// ---------- helpers ----------

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

async function authorized(request, env) {
  const header = request.headers.get('authorization') || '';
  const key = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!key || !env.EDIT_KEY) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(key)),
    crypto.subtle.digest('SHA-256', enc.encode(env.EDIT_KEY)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const now = () => new Date().toISOString();

// ---------- API ----------

async function handleApi(request, env, url) {
  const path = url.pathname.slice(4); // strip /api
  const method = request.method;
  let m;

  if (method === 'GET' && path === '/state') return json(await getState(env));

  if (method === 'POST' && path === '/auth') {
    const ok = await authorized(request, env);
    return json({ ok }, ok ? 200 : 401);
  }

  if (!(await authorized(request, env))) return json({ error: 'Edit passphrase missing or wrong' }, 401);

  if (method === 'PUT' && (m = path.match(/^\/rooms\/([a-z0-9]+)$/))) {
    const body = (await readJson(request)) || {};
    const notes = clean(body.notes, LIMITS.notes);
    const res = await env.DB.prepare('UPDATE rooms SET notes = ?1 WHERE id = ?2').bind(notes, m[1]).run();
    if (!res.meta.changes) return json({ error: 'No such room' }, 404);
    return json({ id: m[1], notes });
  }

  if (method === 'POST' && (m = path.match(/^\/rooms\/([a-z0-9]+)\/measurements$/))) {
    const body = (await readJson(request)) || {};
    const label = clean(body.label, LIMITS.label) || 'New measurement';
    const { max } = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS max FROM measurements WHERE room_id = ?1').bind(m[1]).first();
    try {
      const row = await env.DB.prepare(
        'INSERT INTO measurements (room_id, label, sort, updated_at) VALUES (?1, ?2, ?3, ?4) RETURNING *',
      ).bind(m[1], label, max + 1, now()).first();
      return json(row, 201);
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) return json({ error: 'That label already exists in this room' }, 409);
      if (/FOREIGN KEY/i.test(err.message)) return json({ error: 'No such room' }, 404);
      throw err;
    }
  }

  if (method === 'PUT' && (m = path.match(/^\/measurements\/(\d+)$/))) {
    const body = (await readJson(request)) || {};
    const sets = [];
    const vals = [];
    if ('label' in body) { sets.push('label = ?'); vals.push(clean(body.label, LIMITS.label) || 'Untitled'); }
    if ('raw' in body) { sets.push('raw = ?'); vals.push(clean(body.raw, LIMITS.raw)); }
    if ('inches' in body) {
      const n = body.inches === null || body.inches === '' ? null : Number(body.inches);
      sets.push('inches = ?'); vals.push(Number.isFinite(n) ? n : null);
    }
    if ('note' in body) { sets.push('note = ?'); vals.push(clean(body.note, LIMITS.note)); }
    if (!sets.length) return json({ error: 'Nothing to update' }, 400);
    sets.push('updated_at = ?'); vals.push(now());
    vals.push(Number(m[1]));
    try {
      const row = await env.DB.prepare(`UPDATE measurements SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...vals).first();
      if (!row) return json({ error: 'No such measurement' }, 404);
      return json(row);
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) return json({ error: 'That label already exists in this room' }, 409);
      throw err;
    }
  }

  if (method === 'DELETE' && (m = path.match(/^\/measurements\/(\d+)$/))) {
    const res = await env.DB.prepare('DELETE FROM measurements WHERE id = ?1').bind(Number(m[1])).run();
    if (!res.meta.changes) return json({ error: 'No such measurement' }, 404);
    return json({ ok: true });
  }

  // ---- boxes ----
  // id is the number written on the box. A missing id takes the next free number.

  if (method === 'POST' && path === '/boxes') {
    const body = (await readJson(request)) || {};
    const { max } = await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS max FROM boxes').first();
    const id = Number.isInteger(body.id) && body.id > 0 ? body.id : max + 1;
    const room = body.room_id ? clean(body.room_id, 40) : null;
    try {
      const row = await env.DB.prepare('INSERT INTO boxes (id, room_id, contents, updated_at) VALUES (?1, ?2, ?3, ?4) RETURNING *')
        .bind(id, room, clean(body.contents, LIMITS.contents), now()).first();
      return json({ ...row, photos: [] }, 201);
    } catch (err) {
      return boxError(err);
    }
  }

  if (method === 'PUT' && (m = path.match(/^\/boxes\/(\d+)$/))) {
    const body = (await readJson(request)) || {};
    const sets = [];
    const vals = [];
    if ('id' in body) {
      const n = Number(body.id);
      if (!Number.isInteger(n) || n < 1) return json({ error: 'Box numbers are whole numbers from 1 up' }, 400);
      sets.push('id = ?'); vals.push(n);
    }
    if ('room_id' in body) { sets.push('room_id = ?'); vals.push(body.room_id ? clean(body.room_id, 40) : null); }
    if ('contents' in body) { sets.push('contents = ?'); vals.push(clean(body.contents, LIMITS.contents)); }
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) return json({ error: 'Unknown status' }, 400);
      sets.push('status = ?'); vals.push(body.status);
    }
    if ('fragile' in body) { sets.push('fragile = ?'); vals.push(body.fragile ? 1 : 0); }
    if ('open_first' in body) { sets.push('open_first = ?'); vals.push(body.open_first ? 1 : 0); }
    if (!sets.length) return json({ error: 'Nothing to update' }, 400);
    sets.push('updated_at = ?'); vals.push(now());
    const oldId = Number(m[1]);
    vals.push(oldId);
    try {
      const row = await env.DB.prepare(`UPDATE boxes SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...vals).first();
      if (!row) return json({ error: 'No such box' }, 404);
      // Renumbering: the photos follow. The FK cascades when enforced; this covers it if not.
      if (row.id !== oldId) await env.DB.prepare('UPDATE box_photos SET box_id = ?1 WHERE box_id = ?2').bind(row.id, oldId).run();
      const photos = await env.DB.prepare('SELECT id, box_id, caption, width, height, sort, created_at FROM box_photos WHERE box_id = ?1 ORDER BY sort, created_at').bind(row.id).all();
      return json({ ...row, photos: photos.results });
    } catch (err) {
      return boxError(err);
    }
  }

  if (method === 'DELETE' && (m = path.match(/^\/boxes\/(\d+)$/))) {
    const id = Number(m[1]);
    const photos = await env.DB.prepare('SELECT id FROM box_photos WHERE box_id = ?1').bind(id).all();
    const [, res] = await env.DB.batch([
      env.DB.prepare('DELETE FROM box_photos WHERE box_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM boxes WHERE id = ?1').bind(id),
    ]);
    if (!res.meta.changes) return json({ error: 'No such box' }, 404);
    const keys = photos.results.flatMap((p) => [`${p.id}/full.jpg`, `${p.id}/thumb.jpg`]);
    if (keys.length) await env.PHOTOS.delete(keys);
    return json({ ok: true });
  }

  if (method === 'POST' && (m = path.match(/^\/boxes\/(\d+)\/photos$/))) {
    const box = await env.DB.prepare('SELECT id FROM boxes WHERE id = ?1').bind(Number(m[1])).first();
    if (!box) return json({ error: 'No such box' }, 404);
    const up = await storeUpload(request, env);
    if (up.error) return up.error;
    const { max } = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS max FROM box_photos WHERE box_id = ?1').bind(box.id).first();
    const row = await env.DB.prepare(
      'INSERT INTO box_photos (id, box_id, caption, width, height, sort, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING *',
    ).bind(up.id, box.id, up.caption, up.width, up.height, max + 1, now()).first();
    return json(row, 201);
  }

  // ---- photos ----

  if (method === 'POST' && (m = path.match(/^\/rooms\/([a-z0-9]+)\/photos$/))) {
    const room = await env.DB.prepare('SELECT id FROM rooms WHERE id = ?1').bind(m[1]).first();
    if (!room) return json({ error: 'No such room' }, 404);
    const up = await storeUpload(request, env);
    if (up.error) return up.error;
    const { max } = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS max FROM photos WHERE room_id = ?1').bind(m[1]).first();
    const row = await env.DB.prepare(
      'INSERT INTO photos (id, room_id, caption, width, height, sort, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING *',
    ).bind(up.id, m[1], up.caption, up.width, up.height, max + 1, now()).first();
    return json(row, 201);
  }

  if (method === 'PUT' && (m = path.match(/^\/photos\/([0-9a-f-]{36})$/))) {
    const body = (await readJson(request)) || {};
    const caption = clean(body.caption, LIMITS.caption);
    for (const table of PHOTO_TABLES) {
      const row = await env.DB.prepare(`UPDATE ${table} SET caption = ?1 WHERE id = ?2 RETURNING *`).bind(caption, m[1]).first();
      if (row) return json(row);
    }
    return json({ error: 'No such photo' }, 404);
  }

  if (method === 'DELETE' && (m = path.match(/^\/photos\/([0-9a-f-]{36})$/))) {
    for (const table of PHOTO_TABLES) {
      const res = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(m[1]).run();
      if (!res.meta.changes) continue;
      await env.PHOTOS.delete([`${m[1]}/full.jpg`, `${m[1]}/thumb.jpg`]);
      return json({ ok: true });
    }
    return json({ error: 'No such photo' }, 404);
  }

  return json({ error: 'Not found' }, 404);
}

function boxError(err) {
  if (/UNIQUE|PRIMARY KEY/i.test(err.message)) return json({ error: 'That box number is already taken' }, 409);
  if (/FOREIGN KEY/i.test(err.message)) return json({ error: 'No such room' }, 404);
  throw err;
}

// Reads a photo upload (full and thumb JPEGs made in the browser) and stores both in R2 under
// a new id. Returns { id, caption, width, height }, or { error } holding the response to send.
async function storeUpload(request, env) {
  const form = await request.formData();
  const full = form.get('full');
  const thumb = form.get('thumb');
  if (!(full instanceof File) || !(thumb instanceof File)) return { error: json({ error: 'Missing image data' }, 400) };
  if (full.size > 8 * 1024 * 1024) return { error: json({ error: 'Image too large' }, 413) };
  const id = crypto.randomUUID();
  const meta = { httpMetadata: { contentType: 'image/jpeg' } };
  await Promise.all([
    env.PHOTOS.put(`${id}/full.jpg`, full, meta),
    env.PHOTOS.put(`${id}/thumb.jpg`, thumb, meta),
  ]);
  return { id, caption: clean(form.get('caption'), LIMITS.caption), width: Number(form.get('width')) || null, height: Number(form.get('height')) || null };
}

async function getState(env) {
  const [rooms, measurements, photos] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM rooms ORDER BY floor, sort'),
    env.DB.prepare('SELECT * FROM measurements ORDER BY sort, id'),
    env.DB.prepare('SELECT id, room_id, caption, width, height, sort, created_at FROM photos ORDER BY sort, created_at'),
  ]);
  const byRoom = new Map(rooms.results.map((r) => [r.id, { ...r, measurements: [], photos: [] }]));
  let updated = null;
  for (const row of measurements.results) {
    byRoom.get(row.room_id)?.measurements.push(row);
    if (row.updated_at && (!updated || row.updated_at > updated)) updated = row.updated_at;
  }
  for (const row of photos.results) {
    byRoom.get(row.room_id)?.photos.push(row);
    if (row.created_at && (!updated || row.created_at > updated)) updated = row.created_at;
  }
  // The box tables came later; a database that hasn't had schema.sql re-run still serves the rooms.
  let boxes = [];
  try {
    const [rows, boxPhotos] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM boxes ORDER BY id'),
      env.DB.prepare('SELECT id, box_id, caption, width, height, sort, created_at FROM box_photos ORDER BY sort, created_at'),
    ]);
    const byBox = new Map(rows.results.map((b) => [b.id, { ...b, photos: [] }]));
    for (const row of boxPhotos.results) byBox.get(row.box_id)?.photos.push(row);
    for (const b of rows.results) if (b.updated_at && (!updated || b.updated_at > updated)) updated = b.updated_at;
    boxes = [...byBox.values()];
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', path: '/api/state', message: `boxes: ${err.message}` }));
  }
  return { rooms: [...byRoom.values()], boxes, updated };
}

// ---------- photos from R2 ----------

async function servePhoto(request, env, ctx, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const m = url.pathname.match(/^\/photos\/([0-9a-f-]{36})\/(full|thumb)\.jpg$/);
  if (!m) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  const obj = await env.PHOTOS.get(`${m[1]}/${m[2]}.jpg`);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const response = new Response(obj.body, { headers });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}
