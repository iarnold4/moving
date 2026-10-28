// Schematic floor plans as inline SVG, drawn from the leasing plan for arrangement and
// the walkthrough measurements for size. One unit is roughly one inch. Rooms carry
// data-room so the page can make them clickable.

const W = (d, cls = '') => `<path class="wall ${cls}" d="${d}"/>`;
const WIN = (x1, y1, x2, y2) => `<line class="window" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const ROOM = (id, x, y, w, h, extra = '') => `<rect class="room ${extra}" data-room="${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const AREA = (id, d, extra = '') => `<path class="room ${extra}" data-room="${id}" d="${d}"/>`;
const FIX = (x, y, w, h, rx = 0) => `<rect class="fixture" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const LABEL = (x, y, text, cls = '') => {
  const [main, sub] = text.split('/');
  if (!sub) return `<text class="label ${cls}" x="${x}" y="${y}">${text}</text>`;
  return `<text class="label ${cls}" x="${x}" y="${y - 3}">${main}</text><text class="label small" x="${x}" y="${y + 9}">${sub}</text>`;
};
const VLABEL = (x, y, text) => `<text class="label small" x="${x}" y="${y}" transform="rotate(-90 ${x} ${y})">${text}</text>`;

// Door: a gap in the wall plus a swing arc. (hx,hy) = hinge, (tx,ty) = latch side when
// closed, (ox,oy) = latch side when fully open.
const DOOR = (hx, hy, tx, ty, ox, oy, cls = '') => {
  const r = Math.hypot(tx - hx, ty - hy);
  const cross = (tx - hx) * (oy - hy) - (ty - hy) * (ox - hx);
  const sweep = cross > 0 ? 1 : 0;
  return `<line class="gap" x1="${hx}" y1="${hy}" x2="${tx}" y2="${ty}"/>` +
    `<line class="door ${cls}" x1="${hx}" y1="${hy}" x2="${ox}" y2="${oy}"/>` +
    `<path class="door ${cls}" d="M${tx},${ty} A${r},${r} 0 0 ${sweep} ${ox},${oy}"/>`;
};

const treads = (x, y, w, h, n, vertical, cls = 'tread') => {
  let s = '';
  for (let i = 1; i < n; i++) {
    s += vertical
      ? `<line class="${cls}" x1="${x}" y1="${y + (h / n) * i}" x2="${x + w}" y2="${y + (h / n) * i}"/>`
      : `<line class="${cls}" x1="${x + (w / n) * i}" y1="${y}" x2="${x + (w / n) * i}" y2="${y + h}"/>`;
  }
  return s;
};

// The U-shaped stair, 36 wide, inside the stair block (x 10-138, y 101-196): up from the
// dining side along the top, winder, down the side wall, winder, back east over the closet.
const stairTreads = (cls = 'tread') => [
  treads(46, 101, 92, 36, 8, false, cls),
  `<line class="${cls}" x1="46" y1="137" x2="10" y2="106"/>`,
  `<line class="${cls}" x1="46" y1="137" x2="22" y2="101"/>`,
  `<line class="${cls}" x1="46" y1="137" x2="10" y2="124"/>`,
  treads(10, 137, 36, 23, 3, true, cls),
  `<line class="${cls}" x1="46" y1="160" x2="10" y2="170"/>`,
  `<line class="${cls}" x1="46" y1="160" x2="10" y2="185"/>`,
  `<line class="${cls}" x1="46" y1="160" x2="24" y2="196"/>`,
  treads(46, 160, 92, 36, 8, false, cls),
].join('');

export function planSvg(floor) {
  const body = floor === 1 ? downstairs() : upstairs();
  return `<svg viewBox="0 0 320 300" role="img" aria-label="${floor === 1 ? 'Downstairs' : 'Upstairs'} floor plan">${body}</svg>`;
}

function downstairs() {
  return [
    ROOM('kitchen', 10, 10, 134, 91),
    ROOM('halfbath', 144, 10, 86, 37),                 // 85 x 36
    ROOM('nook', 230, 10, 80, 41),                     // 72 wide, 41 deep
    ROOM('stairs', 10, 101, 128, 95),
    ROOM('office', 10, 196, 133, 94),                  // 121 x 97
    AREA('dining', 'M144,47 H230 V51 H310 V165 H138 V101 H144 Z', 'open'),
    ROOM('living', 143, 165, 167, 125, 'open'),       // windows to office wall 170

    FIX(12, 12, 108, 16),           // counter along the north wall
    FIX(12, 28, 16, 73),            // counter along the west wall, to the south wall
    FIX(120, 12, 22, 24),           // fridge, against the half bath wall

    stairTreads(),
    `<path class="flow" d="M132,119 H28 V178 H128"/>`,
    `<path class="flow-head" d="M127,173 L136,178 L127,183 Z"/>`,

    W('M10,10 H310 V290 H10 Z'),
    W('M144,10 V47 H230 M230,10 V51'),                 // half bath; the nook is simply beside it
    W('M10,101 H138'),                                 // kitchen / stair block
    W('M138,137 V196'),                                // stair block side; the entry above it is open
    W('M91,160 H138 M91,160 V196', 'thin'),            // closet under the top flight, 47 x 36
    W('M10,196 H143'),                                 // stair block / office
    W('M143,196 V290'),                                // office wall, with interior windows
    WIN(143, 222, 143, 250), WIN(143, 258, 143, 284),

    WIN(310, 33, 310, 96), WIN(310, 119, 310, 182), WIN(310, 204, 310, 267),   // three 63-wide windows, equal gaps

    DOOR(200, 47, 182, 47, 200, 65),                   // half bath, opens out
    DOOR(143, 201, 143, 226, 118, 201),                // office, from the living side
    DOOR(123, 196, 98, 196, 123, 221),                 // closet, from the office
    DOOR(300, 290, 266, 290, 300, 256, 'front'),
    LABEL(283, 251, 'front door', 'door'),            // above the swing, clear of the console

    // Planned TV console (63.8 x 15.7, 22.4 tall) against the south wall, centered on the
    // 10'5" of clear wall between the office corner and the front door trim. The 55" TV
    // (about 48 wide) hangs on the wall above it, drawn as the thin bar at the back.
    // The clearances are from the walkthrough measurements, not the drawing's scale.
    `<g class="console">`,
    `<rect class="frame" x="172.6" y="274.3" width="63.8" height="15.7" rx="1"/>`,
    `<line class="shelf" x1="188.6" y1="274.3" x2="188.6" y2="290"/>`,
    `<line class="shelf" x1="204.5" y1="274.3" x2="204.5" y2="290"/>`,
    `<line class="shelf" x1="220.5" y1="274.3" x2="220.5" y2="290"/>`,
    `<rect class="tv" x="180.5" y="284" width="48" height="3"/>`,
    `</g>`,
    LABEL(204.5, 258, 'console + 55″ TV/63.8 × 15.7', 'small'),
    `<line class="dim" x1="143" y1="282" x2="172.6" y2="282"/>`,
    LABEL(158, 278, '~31″', 'dim'),
    `<line class="dim" x1="236.4" y1="282" x2="266" y2="282"/>`,
    LABEL(251, 278, '~31″', 'dim'),

    LABEL(78, 60, "Kitchen/Kovu's room"),
    LABEL(187, 32, 'Half bath', 'small'),
    LABEL(270, 34, 'Nook'),
    LABEL(122, 113, 'up', 'small'),
    LABEL(68, 151, 'Stairs', 'small'),
    LABEL(114, 168, 'closet below', 'small'),
    LABEL(76, 246, "Office/Kovu's room"),
    LABEL(227, 110, "Dining/Kovu's room"),
    LABEL(226, 231, "Living room/Kovu's room"),
    VLABEL(302, 150, 'windows'),
  ].join('');
}

function upstairs() {
  const well = 'M10,102 H144 V196 H10 Z';
  return [
    ROOM('bath1', 10, 10, 59, 92),                    // 59 x 92
    AREA('bed1', 'M69,10 H310 V196 H241 V102 H117 V77 H69 Z'), // top band, east leg 69 wide
    ROOM('bed1', 69, 77, 48, 25),                     // closet 48 x 25, under the band beside the bath
    AREA('stairs', well, 'void'),
    ROOM('hall', 144, 102, 63, 94),                   // 63 wide
    ROOM('laundry', 207, 102, 34, 94),                // 34 deep
    ROOM('bath2', 10, 196, 59, 94),                   // same as the master bath
    ROOM('bed2', 69, 196, 48, 25),                    // closet 48 x 25
    AREA('bed2', 'M117,196 H310 V290 H69 V221 H117 Z'),

    // the stairs below, seen through the well; the top flight lands in the hall
    `<clipPath id="well"><path d="${well}"/></clipPath>`,
    `<g clip-path="url(#well)">${stairTreads('tread faint')}</g>`,
    `<path class="flow" d="M105,178 H152"/>`,
    `<path class="flow-head" d="M151,173 L160,178 L151,183 Z"/>`,

    W('M10,10 H310 V290 H10 Z'),
    W('M69,10 V102 M10,102 H241'),                    // master bath, then one line under the master
    W('M69,77 H117 V102', 'thin'),                    // master closet
    W('M144,102 V160', 'thin'),                       // hall side; open below it where the stairs land
    W('M207,102 V196 M241,102 V196'),                 // laundry
    W('M10,196 H310'),                                // stairwell and hall / guest side
    W('M69,196 V290'),                                // guest bath
    W('M69,196 V221 H117 V196', 'thin'),              // guest closet

    WIN(310, 33, 310, 96), WIN(310, 119, 310, 182), WIN(310, 204, 310, 267),   // same three windows as downstairs

    DOOR(69, 40, 69, 62, 91, 40),                     // master bath, into the master
    DOOR(103, 77, 80, 77, 103, 54),                   // master closet, swings out into the master
    DOOR(150, 102, 172, 102, 150, 80),                // hall to master
    DOOR(207, 118, 207, 146, 179, 118),               // laundry, double doors swinging out into the hall
    DOOR(207, 174, 207, 146, 179, 174),
    DOOR(150, 196, 172, 196, 150, 218),               // hall to guest
    DOOR(69, 230, 69, 255, 44, 230),                  // guest room to guest bath
    DOOR(80, 221, 105, 221, 80, 246),                 // guest closet, swings out into the room

    LABEL(39, 56, 'Master bath', 'small'),
    LABEL(160, 56, "Master bedroom/Kovu's room"),
    LABEL(93, 93, 'closet', 'small'),
    LABEL(72, 158, 'stairs', 'small'),
    LABEL(72, 168, 'open below', 'small'),
    LABEL(160, 152, 'hall', 'small'),
    VLABEL(226, 152, 'Laundry'),
    LABEL(39, 243, 'Guest bath', 'small'),
    LABEL(93, 211, 'closet', 'small'),
    LABEL(213, 240, "Guest bedroom/Kovu's room"),
    VLABEL(302, 180, 'windows'),

    // Planned queen bed (60 x 80), head on the east wall under the north window. The band
    // is 99 wide, so a 60 bed leaves 39 to split: it sits ~18 off the north wall (room for a
    // nightstand) which leaves ~21 between its south side and the laundry wall corner, the
    // pinch point on the way into the east leg. The exact split is a judgment call to be
    // made in person. The clearances are from the walkthrough measurements, not the
    // drawing's scale.
    `<g class="bed">`,
    `<rect class="frame" x="230" y="25" width="80" height="60" rx="2"/>`,
    `<rect class="pillow" x="295" y="29" width="11" height="25" rx="3"/>`,
    `<rect class="pillow" x="295" y="56" width="11" height="25" rx="3"/>`,
    `<line class="fold" x1="282" y1="25" x2="282" y2="85"/>`,
    `</g>`,
    LABEL(256, 56, 'queen/60×80', 'small'),
    `<line class="dim" x1="262" y1="11" x2="262" y2="24"/>`,
    LABEL(244, 21, '~18″', 'dim'),
    `<line class="dim" x1="236" y1="85" x2="236" y2="102"/>`,
    LABEL(224, 97, '~21″', 'dim'),
  ].join('');
}
