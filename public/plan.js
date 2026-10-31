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

// ---- furniture layouts ----
//
// Rooms with more than one arrangement. The page shows a chooser for these and redraws the
// plan: planSvg(floor, choices) takes { roomId: layoutId }, and the first option is the
// default. Each option draws its own furniture. Clearances in the notes come from the
// walkthrough measurements, not the drawing's scale.
export const LAYOUTS = {
  office: {
    floor: 1,
    name: 'Office',
    options: [
      {
        id: 'west', name: 'Desk on the west wall, with the loveseat', draw: officeWest,
        note: 'Desk flush in the north-west corner with the chair facing the wall; loveseat in the south-east corner, its arm beside the interior windows. From the door it is a straight walk of 30″ or more to the chair, and about 35″ of open floor in front of the loveseat. About 21″ separates the desk from the loveseat, so nothing touches. You work with your back to the windows.',
      },
      {
        id: 'floating', name: 'Floating desk facing the windows', draw: officeFloating,
        note: 'Desk pulled about 30″ off the west wall and flush with the south wall, chair between it and the wall, so you look east across the room at the interior windows with the monitors in the lower part of the view. From the door, go west along the 34″ lane north of the desk and turn south behind it; the lane is tight while the closet door stands open. The east half of the room stays open. The loveseat does not fit with this desk: no wall east of the desk is long enough, and floated it blocks the door.',
      },
    ],
  },
  bed2: {
    floor: 2,
    name: 'Guest bedroom',
    options: [
      {
        id: 'south', name: 'Head on the south wall', draw: guestSouth,
        note: 'Head on the south wall, tight to the brick, so the window runs alongside the whole bed; the sill is about 21″ above the mattress, a window seat for Kovu. 22″ between the foot and the hall wall. The west side is open and takes the nightstand. Head south keeps the sleeper a bed length further from the master and the laundry.',
      },
      {
        id: 'north', name: 'Head on the north wall', draw: guestNorth,
        note: 'Same spot, flipped: head against the hall wall, foot toward the south, with 22″ at the foot. The window still runs alongside the bed, so Kovu gets his window spot. The sleeper faces the door, but their head is against the hall and next to the laundry, so it is the noisier choice.',
      },
      {
        id: 'east', name: 'Head under the window, like the master', draw: guestEast,
        note: 'Like the master: head on the brick under the window, bed lying east–west across the room. About 21″ on each side to the north and south walls, so both sides are reachable but narrow, and only the west end of the room stays open. A headboard taller than the 46″ sill blocks the bottom of the window. Probably best for people, but Kovu loses his window seat.',
      },
    ],
  },
};

export function chosen(roomId, choices = {}) {
  const { options } = LAYOUTS[roomId];
  return options.find((o) => o.id === choices[roomId]) || options[0];
}
const layoutSvg = (roomId, choices) => chosen(roomId, choices).draw();

// Marker for a room with more than one layout: two stacked squares in the room's corner.
const ALT = (id, x, y) => `<g class="alt" data-room="${id}"><title>More than one layout. Tap to compare.</title>` +
  `<rect x="${x}" y="${y + 3}" width="9" height="9" rx="1.5"/><rect x="${x + 3}" y="${y}" width="9" height="9" rx="1.5"/></g>`;

// The office is drawn 133 x 94 for a measured 121 x 97, so its furniture is scaled to the
// room instead of drawn in inches, and the fits and gaps read true. Positions are inches
// from the room's north-west corner.
const r1 = (n) => Math.round(n * 10) / 10;
const OX = (i) => r1(10 + (i * 133) / 121);
const OY = (i) => r1(196 + (i * 94) / 97);
const OW = (i) => r1((i * 133) / 121);
const OH = (i) => r1((i * 94) / 97);

// Desk (32 x 63) flush in the north-west corner, chair facing the wall. Loveseat (68 x 39)
// in the south-east corner, so it starts 53 from the west wall and its arm sits beside the
// interior windows. Desk to loveseat is 21. The walk from the door to the chair is the open
// band north of the loveseat, 58 deep less the closet door's swing; it is plain enough in the
// drawing not to need a dimension.
function officeWest() {
  return [
    `<g class="furn desk" data-room="furniture">`,
    `<rect class="frame" x="${OX(0)}" y="${OY(0)}" width="${OW(32)}" height="${OH(63)}" rx="1"/>`,
    `<rect class="tv" x="${OX(1.5)}" y="${OY(17)}" width="${OW(2)}" height="${OH(29)}"/>`,    // monitors, along the wall
    `</g>`,
    FIX(OX(35), OY(20), OW(22), OH(24), 3),                                                   // desk chair
    `<g class="furn loveseat" data-room="furniture">`,
    `<rect class="frame" x="${OX(53)}" y="${OY(58)}" width="${OW(68)}" height="${OH(39)}" rx="2"/>`,
    `<path class="part" d="M${OX(59)},${OY(58)} V${OY(97)} M${OX(115)},${OY(58)} V${OY(97)} M${OX(59)},${OY(89)} H${OX(115)} M${OX(87)},${OY(58)} V${OY(89)}"/>`,
    `</g>`,
    `<line class="dim" x1="${OX(32)}" y1="${OY(61)}" x2="${OX(53)}" y2="${OY(61)}"/>`,
    LABEL(OX(42.5), OY(57), '~21″', 'dim'),
  ].join('');
}

// Desk pulled 30 off the west wall and flush with the south wall, chair between it and the
// wall facing east, so the view from the chair is across the room to the interior windows,
// which run along the south 58 of the east wall. The way in is the 34 lane north of the
// desk, then south behind it. The east half of the room stays open. The loveseat has no
// place here: no stretch of wall east of the desk is 68 long, and floated it blocks the door.
function officeFloating() {
  return [
    `<g class="furn desk" data-room="furniture">`,
    `<rect class="frame" x="${OX(30)}" y="${OY(34)}" width="${OW(32)}" height="${OH(63)}" rx="1"/>`,
    `<rect class="tv" x="${OX(58.5)}" y="${OY(51)}" width="${OW(2)}" height="${OH(29)}"/>`,  // monitors, on the room side
    `</g>`,
    FIX(OX(4), OY(53), OW(22), OH(24), 3),                                                    // desk chair, back to the west wall
    `<line class="dim" x1="${OX(0)}" y1="${OY(45)}" x2="${OX(30)}" y2="${OY(45)}"/>`,
    LABEL(OX(15), OY(41), '~30″', 'dim'),
    `<line class="dim" x1="${OX(40)}" y1="${OY(0)}" x2="${OX(40)}" y2="${OY(34)}"/>`,
    LABEL(OX(31), OY(14), '~34″', 'dim'),
  ].join('');
}

// Guest queen (60 x 80). The room is 102 deep, drawn 1:1. Head on the south wall and tight
// to the brick, so the window runs alongside the whole bed: the sill is about 21 above the
// mattress, a window seat for the dog, who is the usual occupant. 22 is left between the
// foot and the hall wall; the west side is open and takes the one nightstand.
function guestSouth() {
  return [
    `<g class="furn bed" data-room="furniture">`,
    `<rect class="frame" x="250" y="210" width="60" height="80" rx="2"/>`,
    `<rect class="pillow" x="254" y="275" width="25" height="11" rx="3"/>`,
    `<rect class="pillow" x="281" y="275" width="25" height="11" rx="3"/>`,
    `<line class="part" x1="250" y1="262" x2="310" y2="262"/>`,
    `</g>`,
    `<line class="dim" x1="280" y1="188" x2="280" y2="210"/>`,
    LABEL(266, 203, '~22″', 'dim'),
  ].join('');
}

// The same spot flipped: head against the hall wall, 22 at the foot to the south wall.
function guestNorth() {
  return [
    `<g class="furn bed" data-room="furniture">`,
    `<rect class="frame" x="250" y="188" width="60" height="80" rx="2"/>`,
    `<rect class="pillow" x="254" y="192" width="25" height="11" rx="3"/>`,
    `<rect class="pillow" x="281" y="192" width="25" height="11" rx="3"/>`,
    `<line class="part" x1="250" y1="216" x2="310" y2="216"/>`,
    `</g>`,
    `<line class="dim" x1="280" y1="268" x2="280" y2="290"/>`,
    LABEL(266, 283, '~22″', 'dim'),
  ].join('');
}

// Like the master: head on the brick under the window, the bed across the 102 room, so 21
// is left on each side.
function guestEast() {
  return [
    `<g class="furn bed" data-room="furniture">`,
    `<rect class="frame" x="230" y="209" width="80" height="60" rx="2"/>`,
    `<rect class="pillow" x="295" y="213" width="11" height="25" rx="3"/>`,
    `<rect class="pillow" x="295" y="240" width="11" height="25" rx="3"/>`,
    `<line class="part" x1="282" y1="209" x2="282" y2="269"/>`,
    `</g>`,
    `<line class="dim" x1="262" y1="188" x2="262" y2="209"/>`,
    LABEL(248, 202, '~21″', 'dim'),
    `<line class="dim" x1="262" y1="269" x2="262" y2="290"/>`,
    LABEL(248, 283, '~21″', 'dim'),
  ].join('');
}

export function planSvg(floor, choices = {}) {
  const body = floor === 1 ? downstairs(choices) : upstairs(choices);
  return `<svg viewBox="0 0 320 300" role="img" aria-label="${floor === 1 ? 'Downstairs' : 'Upstairs'} floor plan">${body}</svg>`;
}

function downstairs(choices) {
  return [
    ROOM('kitchen', 10, 10, 134, 91),
    ROOM('halfbath', 144, 10, 86, 37),                 // 85 x 36
    ROOM('nook', 230, 10, 80, 41),                     // 72 wide, 41 deep
    ROOM('stairs', 10, 101, 128, 95),
    ROOM('office', 10, 196, 133, 94),                  // 121 x 97
    AREA('dining', 'M144,47 H230 V51 H310 V157 H138 V101 H144 Z', 'open'),
    ROOM('living', 143, 157, 167, 133, 'open'),       // windows to office wall 170; starts at the couch

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
    WIN(143, 236, 143, 258), WIN(143, 264, 143, 286),   // interior windows, between the office door and the south wall

    WIN(310, 33, 310, 96), WIN(310, 119, 310, 182), WIN(310, 204, 310, 267),   // three 63-wide windows, equal gaps

    DOOR(200, 47, 182, 47, 200, 65),                   // half bath, opens out
    DOOR(143, 202, 143, 232, 113, 202),                // office, from the living side; south jamb 58 from the south wall
    DOOR(123, 196, 98, 196, 123, 221),                 // closet, from the office
    DOOR(300, 290, 266, 290, 300, 256, 'front'),
    LABEL(283, 251, 'front door', 'door'),            // above the swing, clear of the console

    // Furniture, drawn at the measured sizes. Sizes live on the Furniture card, which
    // tapping an outline opens. The clearances are from the walkthrough measurements, not
    // the drawing's scale.
    //
    // The living room is 170 between the office wall and the brick, and two paths cross
    // it at the couch's depth: the lane from the front door north along the windows (36
    // minimum) and the way from the dining side to the office door along the office wall
    // (30 minimum). That leaves 104 for seating, so the 87 couch sits alone in the band
    // and the 38 x 40 chair backs onto the office wall just south of the office door,
    // facing east: the TV is about 35 degrees to its right at 6', and it gets pulled
    // forward and turned when it has to be a TV seat. Its front stops 13 short of the
    // coffee table. To keep it off the console's left shelf the console (63.8 x 15.7,
    // 22.4 tall) and the TV axis sit 12.5 east of the center of the clear wall: 42 from
    // the office wall, 17 from the front door trim. The 55" TV (about 48 wide) hangs above
    // the console, drawn as the thin bar at the back. Couch back 129 from the TV wall, so
    // eyes are about 9' from the screen; the 41 x 41 coffee table is 18 off the couch and
    // 14 off the console.
    `<g class="furn console" data-room="furniture">`,
    `<rect class="frame" x="185.1" y="274.3" width="63.8" height="15.7" rx="1"/>`,
    `<path class="part" d="M201.1,274.3 V290 M217,274.3 V290 M233,274.3 V290"/>`,
    `<rect class="tv" x="193" y="284" width="48" height="3"/>`,
    `</g>`,
    `<g class="furn couch" data-room="furniture">`,
    `<rect class="frame" x="173.5" y="161" width="87" height="40" rx="2"/>`,
    `<path class="part" d="M180.5,161 V201 M253.5,161 V201 M180.5,171 H253.5 M204.8,171 V201 M229.2,171 V201"/>`,
    `</g>`,
    `<g class="furn ctable" data-room="furniture">`,
    `<rect class="frame" x="196.5" y="219" width="41" height="41" rx="1"/>`,
    `<rect class="part" x="201.5" y="224" width="31" height="31"/>`,
    `</g>`,
    `<g class="furn chair" data-room="furniture">`,
    `<rect class="frame" x="143" y="232" width="40" height="38" rx="2"/>`,
    `<path class="part" d="M143,238 H183 M143,264 H183 M153,238 V264"/>`,
    `</g>`,
    `<line class="dim" x1="143" y1="181" x2="173.5" y2="181"/>`,
    LABEL(158, 177, '~30″', 'dim'),
    `<line class="dim" x1="260.5" y1="181" x2="310" y2="181"/>`,
    LABEL(285, 177, '~50″', 'dim'),
    `<line class="dim" x1="248.9" y1="282" x2="266" y2="282"/>`,
    LABEL(257.5, 271, '~17″', 'dim'),

    layoutSvg('office', choices),

    LABEL(78, 60, "Kitchen/Kovu's room"),
    LABEL(187, 32, 'Half bath', 'small'),
    LABEL(270, 34, 'Nook'),
    LABEL(122, 113, 'up', 'small'),
    LABEL(68, 151, 'Stairs', 'small'),
    LABEL(114, 168, 'closet below', 'small'),
    LABEL(76, 222, "Office/Kovu's room"),               // high, clear of the furniture in both office layouts
    LABEL(227, 110, "Dining/Kovu's room"),
    LABEL(217, 150, "Living room/Kovu's room"),       // above the couch; the table sits where it was
    VLABEL(302, 150, 'windows'),
    ALT('office', 14, 274),
  ].join('');
}

function upstairs(choices) {
  const well = 'M10,102 H144 V188 H10 Z';
  return [
    ROOM('bath1', 10, 10, 59, 92),                    // 59 x 92
    AREA('bed1', 'M69,10 H310 V188 H241 V102 H117 V77 H69 Z'), // top band, east leg 69 wide
    ROOM('bed1', 69, 77, 48, 25),                     // closet 48 x 25, under the band beside the bath
    AREA('stairs', well, 'void'),
    ROOM('hall', 144, 102, 63, 86),                   // 63 wide
    ROOM('laundry', 207, 102, 34, 86),                // 34 deep
    ROOM('bath2', 10, 188, 59, 102),                  // same as the master bath; the hall/guest wall sits at 188 so the guest room is the measured 102 deep
    ROOM('bed2', 69, 188, 48, 25),                    // closet 48 x 25
    AREA('bed2', 'M117,188 H310 V290 H69 V213 H117 Z'),

    // the stairs below, seen through the well; the top flight lands in the hall
    `<clipPath id="well"><path d="${well}"/></clipPath>`,
    `<g clip-path="url(#well)">${stairTreads('tread faint')}</g>`,
    `<path class="flow" d="M105,178 H152"/>`,
    `<path class="flow-head" d="M151,173 L160,178 L151,183 Z"/>`,

    W('M10,10 H310 V290 H10 Z'),
    W('M69,10 V102 M10,102 H241'),                    // master bath, then one line under the master
    W('M69,77 H117 V102', 'thin'),                    // master closet
    W('M144,102 V160', 'thin'),                       // hall side; open below it where the stairs land
    W('M207,102 V188 M241,102 V188'),                 // laundry
    W('M10,188 H310'),                                // stairwell and hall / guest side
    W('M69,188 V290'),                                // guest bath
    W('M69,188 V213 H117 V188', 'thin'),              // guest closet

    WIN(310, 33, 310, 96), WIN(310, 119, 310, 182), WIN(310, 204, 310, 267),   // same three windows as downstairs

    DOOR(69, 40, 69, 62, 91, 40),                     // master bath, into the master
    DOOR(103, 77, 80, 77, 103, 54),                   // master closet, swings out into the master
    DOOR(150, 102, 172, 102, 150, 80),                // hall to master
    DOOR(207, 118, 207, 146, 179, 118),               // laundry, double doors swinging out into the hall
    DOOR(207, 174, 207, 146, 179, 174),
    DOOR(150, 188, 172, 188, 150, 210),               // hall to guest
    DOOR(69, 230, 69, 255, 44, 230),                  // guest room to guest bath
    DOOR(80, 213, 105, 213, 80, 238),                 // guest closet, swings out into the room

    LABEL(39, 56, 'Master bath', 'small'),
    LABEL(160, 56, "Master bedroom/Kovu's room"),
    LABEL(93, 93, 'closet', 'small'),
    LABEL(72, 158, 'stairs', 'small'),
    LABEL(72, 168, 'open below', 'small'),
    LABEL(160, 152, 'hall', 'small'),
    VLABEL(226, 152, 'Laundry'),
    LABEL(39, 243, 'Guest bath', 'small'),
    LABEL(93, 203, 'closet', 'small'),
    LABEL(173, 240, "Guest bedroom/Kovu's room"),
    VLABEL(302, 160, 'windows'),                        // above the guest bed

    // Planned queen bed (60 x 80), head on the east wall under the north window. The band
    // is 99 wide, so a 60 bed leaves 39 to split: it sits ~18 off the north wall (room for a
    // nightstand) which leaves ~21 between its south side and the laundry wall corner, the
    // pinch point on the way into the east leg. The exact split is a judgment call to be
    // made in person. The clearances are from the walkthrough measurements, not the
    // drawing's scale. Sizes live on the Furniture card, which tapping the outline opens.
    `<g class="furn bed" data-room="furniture">`,
    `<rect class="frame" x="230" y="25" width="80" height="60" rx="2"/>`,
    `<rect class="pillow" x="295" y="29" width="11" height="25" rx="3"/>`,
    `<rect class="pillow" x="295" y="56" width="11" height="25" rx="3"/>`,
    `<line class="part" x1="282" y1="25" x2="282" y2="85"/>`,
    `</g>`,
    `<line class="dim" x1="262" y1="11" x2="262" y2="24"/>`,
    LABEL(244, 21, '~18″', 'dim'),
    `<line class="dim" x1="236" y1="85" x2="236" y2="102"/>`,
    LABEL(224, 97, '~21″', 'dim'),

    layoutSvg('bed2', choices),
    ALT('bed2', 122, 274),
  ].join('');
}
