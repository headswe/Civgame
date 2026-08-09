import { Terrain, type RuinKind, type Tile } from "./types";
import { distance, key, neighbors } from "./hex";

export const MAP_COLS = 22;
export const MAP_ROWS = 16;

function pickRuinKind(rng: () => number): RuinKind {
  const roll = rng();
  if (roll < 0.35) return "city";
  if (roll < 0.65) return "suburb";
  if (roll < 0.8) return "bunker";
  return "trench";
}

/** Simple deterministic-ish value noise built from a seeded PRNG. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Generates the wasteland. Offset-rectangle axial map: for each row r,
 * q ranges over [-floor(r/2), cols - floor(r/2)) so the world shape is
 * roughly rectangular.
 */
export function generateMap(seed = Date.now()): {
  tiles: Map<string, Tile>;
  starts: { q: number; r: number }[];
} {
  const rng = makeRng(seed);
  const tiles = new Map<string, Tile>();

  for (let r = 0; r < MAP_ROWS; r++) {
    const qOff = -Math.floor(r / 2);
    for (let c = 0; c < MAP_COLS; c++) {
      const q = qOff + c;
      const roll = rng();
      let terrain: Terrain;
      if (roll < 0.42) terrain = Terrain.Wastes;
      else if (roll < 0.62) terrain = Terrain.Ashdunes;
      else if (roll < 0.76) terrain = Terrain.Highlands;
      else if (roll < 0.88) terrain = Terrain.Ruins;
      else if (roll < 0.96) terrain = Terrain.Slag;
      else terrain = Terrain.Geovent;
      tiles.set(key(q, r), {
        q,
        r,
        terrain,
        ruinKind: terrain === Terrain.Ruins ? pickRuinKind(rng) : undefined,
        looted: false,
        building: null,
        unit: null,
      });
    }
  }

  // Grow slag into short flows so it reads as rivers of melted city, not confetti.
  for (const t of [...tiles.values()]) {
    if (t.terrain !== Terrain.Slag) continue;
    if (rng() < 0.5) {
      const ns = neighbors(t).filter((n) => tiles.has(key(n.q, n.r)));
      if (ns.length) {
        const n = ns[Math.floor(rng() * ns.length)];
        const nt = tiles.get(key(n.q, n.r))!;
        if (nt.terrain !== Terrain.Geovent) nt.terrain = Terrain.Slag;
      }
    }
  }

  // Four start locations, one per map corner, pulled slightly inward.
  const corners: { r: number; c: number }[] = [
    { r: 2, c: 2 },
    { r: 2, c: MAP_COLS - 3 },
    { r: MAP_ROWS - 3, c: 2 },
    { r: MAP_ROWS - 3, c: MAP_COLS - 3 },
  ];
  const starts = corners.map(({ r, c }) => {
    const q = -Math.floor(r / 2) + c;
    return { q, r };
  });

  // Make each start livable: the citadel tile and its ring become buildable,
  // with a guaranteed ruin nearby so early drones have something to do.
  for (const s of starts) {
    const st = tiles.get(key(s.q, s.r))!;
    st.terrain = Terrain.Wastes;
    st.looted = false;
    const ring = neighbors(s).filter((n) => tiles.has(key(n.q, n.r)));
    ring.forEach((n, i) => {
      const t = tiles.get(key(n.q, n.r))!;
      if (t.terrain === Terrain.Slag) t.terrain = Terrain.Wastes;
      if (i === 0) {
        t.terrain = Terrain.Ruins;
        t.ruinKind = pickRuinKind(rng);
      }
    });
  }

  // No slag chokepoints fully sealing a corner: clear slag within 3 of starts.
  for (const t of tiles.values()) {
    if (t.terrain === Terrain.Slag && starts.some((s) => distance(t, s) <= 3)) {
      t.terrain = Terrain.Ashdunes;
    }
  }

  return { tiles, starts };
}
