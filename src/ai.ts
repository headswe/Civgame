import { Terrain, type Tile, type Unit } from "./types";
import { pick } from "./content";
import { distance, key } from "./hex";
import type { Game } from "./game";

/**
 * The techno-kings' turn. Deliberately simple: expand the grid, farm compute,
 * loot ruins, and march everything else at the nearest rival.
 */
export function runAiTurn(game: Game, f: number) {
  const fs = game.factions[f];
  if (!fs.alive || game.result) return;

  game.runTurrets(f);
  game.refreshUnits(f);

  // Occasionally the techno-king monologues.
  if (Math.random() < 0.22) game.log(pick(fs.def.quotes), "quote");

  aiBuild(game, f);
  aiProduce(game, f);
  aiMoveUnits(game, f);
}

function aiBuild(game: Game, f: number) {
  const fs = game.factions[f];
  const income = game.powerIncome(f);
  const options = game.availableBuildings(f);
  const count = (kind: string) => game.buildings.filter((b) => b.faction === f && b.kind === kind).length;

  // Priority: keep power positive, then compute, then war infrastructure.
  let want: string | null = null;
  if (income < 4) want = options.find((o) => o.def.kind === "reactor")?.ok ? "reactor" : "solar";
  else if (count("servers") < 2 + Math.floor(game.turn / 8)) want = "servers";
  else if (count("mechworks") === 0 && game.tierOf(f) >= 2) want = "mechworks";
  else if (count("turret") < 2 && game.tierOf(f) >= 1 && Math.random() < 0.5) want = "turret";
  else if (Math.random() < 0.5) want = "solar";

  if (!want) return;
  const opt = options.find((o) => o.def.kind === want);
  if (!opt?.ok) return;

  const plots = game.buildablePlots(f);
  if (!plots.length) return;
  // Reactors love geovents; everything else hugs the citadel.
  const citadel = game.buildings.find((b) => b.faction === f && b.kind === "citadel");
  if (!citadel) return;
  let plot: Tile | undefined;
  if (want === "reactor") plot = plots.find((t) => t.terrain === Terrain.Geovent);
  if (!plot) {
    plots.sort((a, b) => distance(a, citadel) - distance(b, citadel));
    plot = plots[0];
  }
  game.tryBuild(f, opt.def.kind, plot.q, plot.r);
  void fs;
}

function aiProduce(game: Game, f: number) {
  const fs = game.factions[f];
  const myUnits = game.units.filter((u) => u.faction === f);
  const cap = 4 + Math.floor(game.turn / 5);
  if (myUnits.length >= cap) return;

  for (const site of game.productionSites(f)) {
    const opts = game.availableUnits(f, site).filter((o) => o.ok);
    if (!opts.length) continue;
    // Keep one drone around while unlooted ruins remain; otherwise buy the biggest gun.
    const hasDrone = myUnits.some((u) => u.kind === "drone");
    const ruinsLeft = [...game.tiles.values()].some((t) => t.terrain === Terrain.Ruins && !t.looted);
    let choice = opts[opts.length - 1];
    if (!hasDrone && ruinsLeft && opts.some((o) => o.def.kind === "drone") && Math.random() < 0.6) {
      choice = opts.find((o) => o.def.kind === "drone")!;
    }
    // Don't bankrupt the grid on one toy.
    if (fs.power - choice.def.cost < 10 && game.turn > 3) continue;
    game.tryProduce(f, choice.def.kind, site);
  }
}

function aiMoveUnits(game: Game, f: number) {
  for (const u of [...game.units]) {
    if (u.faction !== f || u.hp <= 0) continue;
    if (u.kind === "drone") aiDrone(game, u);
    else aiWarUnit(game, u);
  }
}

function aiDrone(game: Game, u: Unit) {
  if (game.canScavenge(u)) {
    game.scavenge(u);
    return;
  }
  const ruins = [...game.tiles.values()].filter((t) => t.terrain === Terrain.Ruins && !t.looted);
  if (!ruins.length) return;
  ruins.sort((a, b) => distance(a, u) - distance(b, u));
  stepToward(game, u, ruins[0]);
  if (game.canScavenge(u)) game.scavenge(u);
}

function aiWarUnit(game: Game, u: Unit) {
  // Attack anything adjacent first.
  const targets = game.attackTargets(u);
  if (targets.length) {
    // Prefer citadels, then units, then other buildings.
    targets.sort((a, b) => targetScore(b) - targetScore(a));
    game.attack(u, targets[0].q, targets[0].r);
    return;
  }
  // Otherwise march toward the nearest enemy citadel (or any enemy thing).
  const enemies: { q: number; r: number; score: number }[] = [];
  for (const b of game.buildings) {
    if (b.faction !== u.faction && game.factions[b.faction].alive) {
      enemies.push({ q: b.q, r: b.r, score: b.kind === "citadel" ? 2 : 1 });
    }
  }
  for (const e of game.units) {
    if (e.faction !== u.faction) enemies.push({ q: e.q, r: e.r, score: 1 });
  }
  if (!enemies.length) return;
  enemies.sort((a, b) => distance(a, u) - distance(b, u) || b.score - a.score);
  stepToward(game, u, enemies[0]);
  const after = game.attackTargets(u);
  if (after.length) {
    after.sort((a, b) => targetScore(b) - targetScore(a));
    game.attack(u, after[0].q, after[0].r);
  }
}

function targetScore(t: Tile): number {
  if (t.building?.kind === "citadel") return 3;
  if (t.unit) return 2;
  if (t.building?.kind === "servers") return 2;
  return 1;
}

/** Move u as close to goal as its reachable range allows. */
function stepToward(game: Game, u: Unit, goal: { q: number; r: number }) {
  const range = game.moveRange(u);
  let best: { q: number; r: number } | null = null;
  let bestD = distance(u, goal);
  for (const k of range.keys()) {
    const [q, r] = k.split(",").map(Number);
    const d = distance({ q, r }, goal);
    if (d < bestD) {
      bestD = d;
      best = { q, r };
    }
  }
  if (best) game.moveUnit(u, best.q, best.r);
  void key;
}
