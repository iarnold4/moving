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

-- Rooms. Floor 1 = downstairs, 2 = upstairs. Blurbs describe position physically
-- (relative to the front door and the window wall), not by compass.
INSERT OR IGNORE INTO rooms (id, name, floor, sort, blurb) VALUES
  ('living',   'Living room',   1, 1, 'Along the big window wall. The front door is in the corner at the near end.'),
  ('dining',   'Dining area',   1, 2, 'Open area between the kitchen and the windows, under the pendant light.'),
  ('kitchen',  'Kitchen',       1, 3, 'In the corner diagonally opposite the front door.'),
  ('office',   'Office',        1, 4, 'Glass-walled room beside the living room, on the front-door side.'),
  ('nook',     'Nook',          1, 5, 'Alcove in the far corner by the windows, where the leasing plan shows a foyer.'),
  ('stairs',   'Stairs & closet', 1, 6, 'Stairs up, with a closet underneath.'),
  ('halfbath', 'Half bath',     1, 7, 'Downstairs powder room between the kitchen and the nook.'),
  ('bed1',     'Bedroom 1',     2, 1, 'Upstairs, over the kitchen end.'),
  ('bed2',     'Bedroom 2',     2, 2, 'Upstairs, over the living room end.'),
  ('bath1',    'Bathroom 1',    2, 3, 'Upstairs, at the kitchen end, by bedroom 1.'),
  ('bath2',    'Bathroom 2',    2, 4, 'Upstairs, at the living room end, off the hall.'),
  ('laundry',  'Laundry closet', 2, 5, 'Stacked washer and dryer in the upstairs hall.'),
  ('hall',     'Upstairs hall', 2, 6, 'Landing at the top of the stairs and the hall between the bedrooms.');

-- Measurement checklist. Empty rows to fill in during the walkthrough; more can be added on the site.
INSERT OR IGNORE INTO measurements (room_id, label, sort) VALUES
  ('living', 'Room length, along the window wall', 1),
  ('living', 'Room width, front-door wall to the far side', 2),
  ('living', 'Ceiling height', 3),
  ('living', 'Front door, clear width', 4),
  ('living', 'Front door, height', 5),
  ('living', 'Window, width', 6),
  ('living', 'Window, height', 7),
  ('living', 'Window sill, height from floor', 8),
  ('living', 'Wall above window, to ceiling', 9),
  ('living', 'Front-door wall, door to office glass (TV wall)', 10),

  ('dining', 'Open span, kitchen to windows', 1),
  ('dining', 'Open span, nook wall to living area', 2),
  ('dining', 'Pendant light, height from floor', 3),
  ('dining', 'Wall beside the nook, width (for a sideboard)', 4),

  ('kitchen', 'Counter run, length', 1),
  ('kitchen', 'Counter, depth', 2),
  ('kitchen', 'Counter, height', 3),
  ('kitchen', 'Fridge opening, width', 4),
  ('kitchen', 'Fridge opening, depth', 5),
  ('kitchen', 'Fridge opening, height to cabinet', 6),
  ('kitchen', 'Free wall for a cart or shelf, width', 7),
  ('kitchen', 'Window, width', 8),
  ('kitchen', 'Window, height', 9),

  ('office', 'Length', 1),
  ('office', 'Width', 2),
  ('office', 'Ceiling height', 3),
  ('office', 'Door, clear width', 4),
  ('office', 'Glass wall, width', 5),
  ('office', 'Glass wall, height', 6),
  ('office', 'Closet, width', 7),
  ('office', 'Closet, depth', 8),
  ('office', 'Exterior window, width', 9),

  ('nook', 'Opening, width', 1),
  ('nook', 'Depth', 2),
  ('nook', 'Height', 3),

  ('stairs', 'Stair width, wall to wall', 1),
  ('stairs', 'Stair width, handrail to wall', 2),
  ('stairs', 'Headroom at the lowest point', 3),
  ('stairs', 'Number of steps', 4),
  ('stairs', 'Closet door, width', 5),
  ('stairs', 'Closet, width', 6),
  ('stairs', 'Closet, depth', 7),

  ('halfbath', 'Length', 1),
  ('halfbath', 'Width', 2),
  ('halfbath', 'Door, clear width', 3),
  ('halfbath', 'Free wall for a shelf, width', 4),

  ('bed1', 'Length', 1),
  ('bed1', 'Width', 2),
  ('bed1', 'Ceiling height', 3),
  ('bed1', 'Door, clear width', 4),
  ('bed1', 'Window, width', 5),
  ('bed1', 'Window, height', 6),
  ('bed1', 'Window sill, height from floor', 7),
  ('bed1', 'Closet, width', 8),
  ('bed1', 'Closet, depth', 9),
  ('bed1', 'Headboard wall, width', 10),

  ('bed2', 'Length', 1),
  ('bed2', 'Width', 2),
  ('bed2', 'Ceiling height', 3),
  ('bed2', 'Door, clear width', 4),
  ('bed2', 'Window, width', 5),
  ('bed2', 'Window, height', 6),
  ('bed2', 'Window sill, height from floor', 7),
  ('bed2', 'Closet, width', 8),
  ('bed2', 'Closet, depth', 9),
  ('bed2', 'Headboard wall, width', 10),

  ('bath1', 'Length', 1),
  ('bath1', 'Width', 2),
  ('bath1', 'Door, clear width', 3),
  ('bath1', 'Vanity, width', 4),
  ('bath1', 'Tub or shower, length', 5),
  ('bath1', 'Towel wall, width', 6),

  ('bath2', 'Length', 1),
  ('bath2', 'Width', 2),
  ('bath2', 'Door, clear width', 3),
  ('bath2', 'Vanity, width', 4),
  ('bath2', 'Tub or shower, length', 5),
  ('bath2', 'Towel wall, width', 6),

  ('laundry', 'Opening, width', 1),
  ('laundry', 'Depth', 2),
  ('laundry', 'Height', 3),

  ('hall', 'Width', 1),
  ('hall', 'Length', 2),
  ('hall', 'Ceiling height', 3);
