// Schematic floor plans as inline SVG, traced from the leasing plan (B16a) with the
// front door moved to where it really is. Coordinates are a 320 x 300 box per floor.
// Not to scale: arrangement only. Rooms carry data-room so the page can make them clickable.

const W = (d, cls = '') => `<path class="wall ${cls}" d="${d}"/>`;
const WIN = (x1, y1, x2, y2) => `<line class="window" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const ROOM = (id, x, y, w, h, extra = '') => `<rect class="room ${extra}" data-room="${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const AREA = (id, d, extra = '') => `<path class="room ${extra}" data-room="${id}" d="${d}"/>`;
const FIX = (x, y, w, h, rx = 0) => `<rect class="fixture" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
const LABEL = (x, y, text, cls = '') => `<text class="label ${cls}" x="${x}" y="${y}">${text}</text>`;
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

// Bifold / double doors along a wall from (x1,y1) to (x2,y2); d = zig depth toward
// the side they open on.
const BIFOLD = (x1, y1, x2, y2, d) => {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const horizontal = y1 === y2;
  const q1 = horizontal ? `${(x1 + mx) / 2},${y1 + d}` : `${x1 + d},${(y1 + my) / 2}`;
  const q2 = horizontal ? `${(mx + x2) / 2},${y1 + d}` : `${x1 + d},${(my + y2) / 2}`;
  return `<line class="gap" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` +
    `<path class="door" d="M${x1},${y1} L${q1} L${mx},${my} L${q2} L${x2},${y2}"/>`;
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

// The U-shaped stair inside the stair block (x 10-138, y 101-185): up from the dining
// side along the top, winder, down the side wall, winder, back east over the closet.
const stairTreads = (cls = 'tread', b = 185) => [
  treads(43, 101, 95, 27, 8, false, cls),
  `<line class="${cls}" x1="43" y1="128" x2="10" y2="106"/>`,
  `<line class="${cls}" x1="43" y1="128" x2="22" y2="101"/>`,
  `<line class="${cls}" x1="43" y1="128" x2="10" y2="120"/>`,
  treads(10, 128, 33, 24, 4, true, cls),
  `<line class="${cls}" x1="43" y1="152" x2="10" y2="${152 + (b - 152) * 0.3}"/>`,
  `<line class="${cls}" x1="43" y1="152" x2="10" y2="${b - 6}"/>`,
  `<line class="${cls}" x1="43" y1="152" x2="24" y2="${b}"/>`,
  treads(43, 152, 95, b - 152, 8, false, cls),
].join('');

export function planSvg(floor) {
  const body = floor === 1 ? downstairs() : upstairs();
  return `<svg viewBox="0 0 320 300" role="img" aria-label="${floor === 1 ? 'Downstairs' : 'Upstairs'} floor plan">${body}</svg>`;
}

function downstairs() {
  return [
    // rooms (click targets)
    ROOM('kitchen', 10, 10, 134, 91),
    ROOM('halfbath', 144, 10, 86, 37),
    ROOM('nook', 230, 10, 80, 37),
    ROOM('stairs', 10, 101, 128, 84),
    ROOM('office', 10, 185, 133, 105),
    AREA('dining', 'M144,47 H310 V165 H138 V101 H144 Z', 'open'),
    ROOM('living', 143, 165, 167, 125, 'open'),

    // fixtures
    FIX(12, 12, 108, 16),           // counter along the top wall
    FIX(12, 28, 16, 73),            // counter along the side wall, to the south wall
    FIX(120, 12, 22, 24),           // fridge, against the half bath wall

    // stairs and the closet underneath the last flight
    stairTreads(),
    `<path class="flow" d="M132,114 H27 V174 H128"/>`,
    `<path class="flow-head" d="M127,169 L136,174 L127,179 Z"/>`,

    // walls
    W('M10,10 H310 V290 H10 Z'),
    W('M144,10 V47 H230 M230,10 V47'),          // half bath; the nook is simply beside it
    W('M10,101 H138'),                          // kitchen / stair block
    W('M138,128 V185'),                         // stair block side (the entry above it is open)
    W('M87,152 H138 M87,152 V185', 'thin'),     // closet under the top flight
    W('M10,185 H143'),                          // stair block / office
    W('M143,185 V290'),                         // office wall, with interior windows
    WIN(143, 222, 143, 250), WIN(143, 258, 143, 284),

    // windows along the long wall
    WIN(310, 20, 310, 60), WIN(310, 80, 310, 130), WIN(310, 150, 310, 200), WIN(310, 220, 310, 270),

    // doors
    DOOR(200, 47, 182, 47, 200, 65),            // half bath, opens out
    DOOR(143, 190, 143, 215, 118, 190),         // office, from the living side
    DOOR(123, 185, 98, 185, 123, 210),          // closet, from the office
    DOOR(300, 290, 266, 290, 300, 256, 'front'),
    LABEL(236, 284, 'front door', 'door'),

    // labels
    LABEL(72, 62, 'Kitchen'),
    LABEL(187, 33, 'Half bath', 'small'),
    LABEL(270, 33, 'Nook'),
    LABEL(122, 110, 'up', 'small'),
    LABEL(65, 143, 'Stairs', 'small'),
    LABEL(112, 163, 'closet below', 'small'),
    LABEL(76, 250, 'Office/Kovu\'s room'),
    LABEL(218, 78, 'Dining'),
    LABEL(205, 225, 'Living room'),
    VLABEL(302, 150, 'windows'),
  ].join('');
}

function upstairs() {
  return [
    ROOM('bath1', 10, 10, 63, 94),
    AREA('bed1', 'M73,10 H310 V176 H241 V104 H140 V69 H73 Z'),
    ROOM('bed1', 73, 69, 67, 35),               // walk-in closet
    ROOM('stairs', 10, 104, 130, 72, 'void'),   // stairwell, open to below
    ROOM('hall', 145, 104, 50, 72),
    ROOM('laundry', 195, 104, 46, 72),
    ROOM('bath2', 10, 176, 55, 114),
    ROOM('bed2', 65, 176, 75, 31),              // guest closet
    AREA('bed2', 'M142,176 H310 V290 H65 V207 H142 Z'),

    // fixtures

    // the stairs below, seen through the well; the top flight lands in the hall
    stairTreads('tread faint', 176),
    treads(95, 152, 43, 24, 4, false),
    `<path class="flow" d="M100,168 H150"/>`,
    `<path class="flow-head" d="M149,163 L158,168 L149,173 Z"/>`,

    // walls
    W('M10,10 H310 V290 H10 Z'),
    W('M73,10 V104 H10'),                       // master bath
    W('M73,69 H140 V104 M73,104 H241'),          // walk-in closet, then the wall under the master
    W('M142,104 V152', 'thin'),                 // stairwell guard; open below it where the stairs land
    W('M195,104 V176 H241 V104'),               // laundry
    W('M10,176 H310'),                          // stairwell / guest side
    W('M65,176 V290'),                          // guest bath
    W('M65,207 H142 M142,176 V207', 'thin'),    // guest closet
    W('M43,152 H95 M43,128 V152', 'thin'),      // edge of the open well

    // windows along the long wall
    WIN(310, 20, 310, 60), WIN(310, 118, 310, 170), WIN(310, 205, 310, 265),

    // doors
    DOOR(73, 44, 73, 66, 95, 44),               // master bath, into the master
    DOOR(118, 69, 95, 69, 118, 46),             // walk-in closet, swings out into the master
    DOOR(145, 104, 170, 104, 145, 79),          // hall to master
    DOOR(195, 118, 195, 140, 173, 118),         // laundry, double doors swinging out into the hall
    DOOR(195, 162, 195, 140, 173, 162),
    DOOR(150, 176, 172, 176, 150, 198),         // hall to guest
    DOOR(65, 230, 65, 255, 40, 230),            // guest room to guest bath
    DOOR(80, 207, 105, 207, 80, 232),           // guest closet, swings out into the room

    LABEL(41, 70, 'Master bath', 'small'),
    LABEL(175, 44, 'Master bedroom/Kovu\'s room'),
    LABEL(106, 92, 'closet', 'small'),
    LABEL(70, 118, 'stairs', 'small'),
    LABEL(70, 128, 'open below', 'small'),
    LABEL(166, 113, 'hall', 'small'),
    LABEL(218, 122, 'Laundry', 'small'),
    LABEL(37, 240, 'Guest bath', 'small'),
    LABEL(103, 195, 'closet', 'small'),
    LABEL(225, 282, 'Guest bedroom/Kovu\'s room'),
    VLABEL(302, 150, 'windows'),
  ].join('');
}
