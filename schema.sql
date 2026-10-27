-- Schema + seed. Safe to re-run: tables are IF NOT EXISTS, seed rows are INSERT OR IGNORE.

CREATE TABLE IF NOT EXISTS rooms (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  floor INTEGER NOT NULL,
  sort  INTEGER NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS measurements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  label      TEXT NOT NULL,
  raw        TEXT NOT NULL DEFAULT '',   -- exactly what was typed, e.g. 8' 6 1/2"
  inches     REAL,                       -- parsed value when the text is a single length
  note       TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT,
  UNIQUE (room_id, label)
);

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES rooms(id),
  caption    TEXT NOT NULL DEFAULT '',
  width      INTEGER,
  height     INTEGER,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS measurements_room ON measurements(room_id, sort);
CREATE INDEX IF NOT EXISTS photos_room ON photos(room_id, sort);

-- Rooms. Floor 1 = downstairs, 2 = upstairs. The windows face east, so blurbs use
-- compass directions. Re-running updates names and blurbs; notes are left alone.
INSERT INTO rooms (id, name, floor, sort, blurb) VALUES
  ('living',   'Living room',    1, 1, 'South-east corner of downstairs, along the east windows. The front door is in its south-east corner and swings in along the window wall.'),
  ('dining',   'Dining area',    1, 2, 'Open floor between the kitchen and the east windows, north of the living room.'),
  ('kitchen',  'Kitchen',        1, 3, 'North-west corner. Counters run along the north and west walls; the fridge sits against the half-bath wall.'),
  ('office',   'Office',         1, 4, 'South-west corner, with interior windows onto the living room. Its door is at the north end of that wall. The closet under the stairs opens into this room.'),
  ('nook',     'Nook',           1, 5, 'North-east corner, beside the half bath, where the leasing plan shows a foyer.'),
  ('stairs',   'Stairs',         1, 6, 'West side, between the kitchen and the office. Up from the dining side, two left turns, landing in the upstairs hall.'),
  ('halfbath', 'Half bath',      1, 7, 'North wall, between the kitchen and the nook. Door opens out toward the dining area.'),
  ('bed1',     'Master bedroom', 2, 1, 'North end upstairs, with the east windows, wrapping around the laundry. Closet and master bath open off it.'),
  ('bath1',    'Master bath',    2, 2, 'North-west corner upstairs, entered from the master bedroom.'),
  ('bed2',     'Guest bedroom',  2, 3, 'South end upstairs, one east window. Its closet and the guest bath open off it.'),
  ('bath2',    'Guest bath',     2, 4, 'South-west corner upstairs, entered from the guest bedroom.'),
  ('laundry',  'Laundry',        2, 5, 'Center of the upstairs, double doors opening into the hall.'),
  ('hall',     'Hall',           2, 6, 'Short hall at the top of the stairs: master door at the north end, laundry on the east side, guest room door at the south end.')
ON CONFLICT(id) DO UPDATE SET name = excluded.name, floor = excluded.floor, sort = excluded.sort, blurb = excluded.blurb;

-- Measurement checklist. Empty rows to fill in during the walkthrough; more can be added on the site.
INSERT OR IGNORE INTO measurements (room_id, label, sort) VALUES
  ('living', 'Room length, along the window wall', 1),
  ('living', 'Ceiling height', 2),
  ('living', 'Front-door wall, length (TV wall)', 3),
  ('living', 'Front-door wall, door to office wall (TV wall without the door)', 4),
  ('living', 'Office wall, length', 5),
  ('living', 'Office wall, office door to south wall', 6),
  ('living', 'Windows to office wall', 7),
  ('living', 'Window, width', 8),
  ('living', 'Window, height', 9),
  ('living', 'Window sill, height from floor', 10),
  ('living', 'Window sill, width', 11),
  ('living', 'Front door, clear width', 12),
  ('living', 'Front door, height', 13),

  ('dining', 'Kitchen counter to windows', 1),
  ('dining', 'Lower ceiling (HVAC soffit), height from floor', 2),

  ('kitchen', 'North counter, sink to fridge', 1),
  ('kitchen', 'North counter, sink to west wall', 2),
  ('kitchen', 'West counter, length including stove', 3),
  ('kitchen', 'West counter, stove to north wall', 4),
  ('kitchen', 'West counter, stove to south wall', 5),
  ('kitchen', 'Counter, depth', 6),
  ('kitchen', 'Counter, height', 7),
  ('kitchen', 'Shelf clearance', 8),
  ('kitchen', 'Fridge opening, width', 9),
  ('kitchen', 'Fridge opening, depth', 10),
  ('kitchen', 'Free wall for a cart or shelf, flush length', 11),
  ('kitchen', 'Free wall for a cart or shelf, full length', 12),

  ('office', 'Length', 1),
  ('office', 'Width', 2),
  ('office', 'Ceiling height', 3),
  ('office', 'Door, clear width', 4),
  ('office', 'Interior windows, width', 5),
  ('office', 'Interior windows, height', 6),
  ('office', 'Closet door, width', 7),
  ('office', 'Closet, width', 8),
  ('office', 'Closet, depth', 9),
  ('office', 'Closet, height at tallest point', 10),

  ('nook', 'Width', 1),
  ('nook', 'Depth', 2),
  ('nook', 'Height', 3),

  ('stairs', 'Stair width, wall to wall', 1),
  ('stairs', 'Stair width, handrail to wall', 2),
  ('stairs', 'Headroom at the lowest point', 3),
  ('stairs', 'Number of steps', 4),

  ('halfbath', 'Length', 1),
  ('halfbath', 'Width', 2),
  ('halfbath', 'Door, clear width', 3),
  ('halfbath', 'Free wall for a shelf, width', 4),

  ('bed1', 'Length, master bath wall to east wall', 1),
  ('bed1', 'Length, north wall to south wall (east leg of the L)', 2),
  ('bed1', 'Width, east-west leg of the L (at widest)', 3),
  ('bed1', 'Width, north-south leg of the L', 4),
  ('bed1', 'Ceiling height', 5),
  ('bed1', 'Door, clear width', 6),
  ('bed1', 'Window, width', 7),
  ('bed1', 'Window, height', 8),
  ('bed1', 'Window sill, height from floor', 9),
  ('bed1', 'Closet, width', 10),
  ('bed1', 'Closet, depth', 11),

  ('bed2', 'Length', 1),
  ('bed2', 'Width, at widest', 2),
  ('bed2', 'Width, at narrowest (by the closet)', 3),
  ('bed2', 'Ceiling height', 4),
  ('bed2', 'Door, clear width', 5),
  ('bed2', 'Window, width', 6),
  ('bed2', 'Window, height', 7),
  ('bed2', 'Window sill, height from floor', 8),
  ('bed2', 'Closet, width', 9),
  ('bed2', 'Closet, depth', 10),

  ('bath1', 'Length', 1),
  ('bath1', 'Width', 2),
  ('bath1', 'Door, clear width', 3),
  ('bath1', 'Vanity, width', 4),
  ('bath1', 'Vanity, length', 5),
  ('bath1', 'Tub or shower, length', 6),
  ('bath1', 'Towel wall, width', 7),

  ('bath2', 'Length', 1),
  ('bath2', 'Width', 2),
  ('bath2', 'Door, clear width', 3),
  ('bath2', 'Vanity, width', 4),
  ('bath2', 'Vanity, length', 5),
  ('bath2', 'Tub or shower, length', 6),
  ('bath2', 'Towel wall, width', 7),

  ('laundry', 'Door opening, width', 1),
  ('laundry', 'Depth', 2),
  ('laundry', 'Height', 3),

  ('hall', 'Width', 1),
  ('hall', 'Length', 2),
  ('hall', 'Ceiling height', 3);
