import {
  Terrain,
  type Building,
  type BuildingDef,
  type BuildingKind,
  type FactionState,
  type Tile,
  type Unit,
  type UnitDef,
  type UnitKind,
} from "./types";
import { BUILDINGS, FACTIONS, TIERS, SINGULARITY_TIER, UNITS, ADVISOR, pick } from "./content";
import { distance, key, neighbors } from "./hex";
import { generateMap } from "./mapgen";

export type LogKind = "info" | "quote" | "combat" | "good";
export type LogFn = (msg: string, kind?: LogKind) => void;

export const GEOVENT_BONUS = 5;
export const RUIN_LOOT = 15;
export const BUILD_RANGE = 2;
export const SIGHT_RANGE = 2;
export const SIGHT_RANGE_FAR = 3; // drones aloft and citadel watchtowers

export interface GameResult {
  winner: number;
  type: "conquest" | "singularity";
}

export class Game {
  tiles: Map<string, Tile>;
  factions: FactionState[];
  units: Unit[] = [];
  buildings: Building[] = [];
  turn = 1;
  playerFaction = 0;
  result: GameResult | null = null;
  log: LogFn = () => {};

  /** Fog of war, player's-eye view. The AI techno-kings cheat; of course they do. */
  explored = new Set<string>();
  visible = new Set<string>();

  private nextUnitId = 1;

  constructor(playerFaction: number, seed?: number) {
    this.playerFaction = playerFaction;
    const { tiles, starts } = generateMap(seed);
    this.tiles = tiles;

    this.factions = FACTIONS.map((def, i) => ({
      def,
      power: 40,
      compute: def.perk === "We Had It All Along" ? 25 : 0,
      alive: true,
      isPlayer: i === playerFaction,
    }));

    starts.forEach((s, i) => {
      this.placeBuilding("citadel", i, s.q, s.r, true);
      // First drone starts beside the citadel so the citadel stays clickable.
      for (const n of neighbors(s)) {
        const t = this.tile(n.q, n.r);
        if (t && !t.unit && t.terrain !== Terrain.Slag) {
          this.spawnUnit("drone", i, n.q, n.r);
          break;
        }
      }
    });

    this.recomputeVision();
  }

  /** Recompute what the player currently sees; anything seen once stays explored. */
  recomputeVision() {
    this.visible.clear();
    const p = this.playerFaction;
    const sources: { q: number; r: number; range: number }[] = [];
    for (const u of this.units) {
      if (u.faction === p) {
        sources.push({ q: u.q, r: u.r, range: u.kind === "drone" ? SIGHT_RANGE_FAR : SIGHT_RANGE });
      }
    }
    for (const b of this.buildings) {
      if (b.faction === p) {
        sources.push({ q: b.q, r: b.r, range: b.kind === "citadel" ? SIGHT_RANGE_FAR : SIGHT_RANGE });
      }
    }
    for (const t of this.tiles.values()) {
      for (const s of sources) {
        if (distance(t, s) <= s.range) {
          const k = key(t.q, t.r);
          this.visible.add(k);
          this.explored.add(k);
          break;
        }
      }
    }
  }

  isVisible(q: number, r: number): boolean {
    return this.visible.has(key(q, r));
  }

  isExplored(q: number, r: number): boolean {
    return this.explored.has(key(q, r));
  }

  // ------------------------------------------------------------------ helpers

  tile(q: number, r: number): Tile | undefined {
    return this.tiles.get(key(q, r));
  }

  tierOf(f: number): number {
    const c = this.factions[f].compute;
    let tier = 0;
    for (let i = 0; i < TIERS.length; i++) if (c >= TIERS[i].compute) tier = i;
    return tier;
  }

  terrainDefense(t: Tile): number {
    if (t.terrain === Terrain.Highlands) return 2;
    if (t.terrain === Terrain.Ruins) return 1;
    return 0;
  }

  private buildCost(def: BuildingDef, faction: number): number {
    const f = this.factions[faction];
    if (f.def.perk === "Two-Day Feudalism") return Math.ceil(def.cost * 0.8);
    return def.cost;
  }

  private unitMove(def: UnitDef, faction: number): number {
    return def.move + (this.factions[faction].def.perk === "Hyperloop Logistics" ? 1 : 0);
  }

  powerIncome(f: number): number {
    let income = 0;
    for (const b of this.buildings) {
      if (b.faction !== f) continue;
      const def = BUILDINGS[b.kind];
      income += def.power;
      if (b.kind === "reactor" && this.tile(b.q, b.r)?.terrain === Terrain.Geovent) {
        income += GEOVENT_BONUS;
      }
    }
    for (const u of this.units) if (u.faction === f) income -= UNITS[u.kind].upkeep;
    return income;
  }

  computeIncome(f: number): number {
    const perkBonus = this.factions[f].def.perk === "Engagement Farming" ? 1 : 0;
    let income = 0;
    for (const b of this.buildings) {
      if (b.faction !== f) continue;
      income += BUILDINGS[b.kind].compute;
      if (b.kind === "servers") income += perkBonus;
    }
    return income;
  }

  // -------------------------------------------------------------- placement

  private placeBuilding(kind: BuildingKind, faction: number, q: number, r: number, free = false): Building | null {
    const t = this.tile(q, r);
    if (!t || t.building) return null;
    const def = BUILDINGS[kind];
    if (!free) {
      const cost = this.buildCost(def, faction);
      if (this.factions[faction].power < cost) return null;
      this.factions[faction].power -= cost;
    }
    const b: Building = { kind, faction, hp: def.hp, q, r };
    t.building = b;
    this.buildings.push(b);
    return b;
  }

  spawnUnit(kind: UnitKind, faction: number, q: number, r: number): Unit | null {
    const t = this.tile(q, r);
    if (!t || t.unit) return null;
    const def = UNITS[kind];
    const u: Unit = {
      id: this.nextUnitId++,
      kind,
      faction,
      hp: def.hp,
      movesLeft: this.unitMove(def, faction),
      attacked: false,
      q,
      r,
    };
    t.unit = u;
    this.units.push(u);
    return u;
  }

  /** Tiles where `faction` may place a building: within BUILD_RANGE of an owned building. */
  canBuildAt(faction: number, q: number, r: number): boolean {
    const t = this.tile(q, r);
    if (!t || t.building || t.terrain === Terrain.Slag) return false;
    if (t.terrain === Terrain.Ruins && !t.looted) return false; // clear the salvage first
    if (t.unit && t.unit.faction !== faction) return false;
    return this.buildings.some(
      (b) => b.faction === faction && distance(b, { q, r }) <= BUILD_RANGE,
    );
  }

  buildablePlots(faction: number): Tile[] {
    const out: Tile[] = [];
    for (const t of this.tiles.values()) {
      if (this.canBuildAt(faction, t.q, t.r)) out.push(t);
    }
    return out;
  }

  availableBuildings(faction: number): { def: BuildingDef; cost: number; ok: boolean; why: string }[] {
    const tier = this.tierOf(faction);
    const f = this.factions[faction];
    return Object.values(BUILDINGS)
      .filter((d) => d.kind !== "citadel")
      .map((def) => {
        const cost = this.buildCost(def, faction);
        let why = "";
        if (def.tier > tier) why = `needs ${TIERS[def.tier].name}`;
        else if (f.power < cost) why = "not enough power";
        return { def, cost, ok: !why, why };
      });
  }

  tryBuild(faction: number, kind: BuildingKind, q: number, r: number): boolean {
    const def = BUILDINGS[kind];
    if (def.tier > this.tierOf(faction)) return false;
    if (!this.canBuildAt(faction, q, r)) return false;
    const b = this.placeBuilding(kind, faction, q, r);
    if (b && this.factions[faction].isPlayer) {
      this.log(`${def.name} constructed. ${def.desc.split(".")[0]}.`, "good");
    }
    return !!b;
  }

  // -------------------------------------------------------------- production

  productionSites(faction: number): Building[] {
    return this.buildings.filter(
      (b) => b.faction === faction && (b.kind === "citadel" || b.kind === "mechworks"),
    );
  }

  availableUnits(faction: number, site: Building): { def: UnitDef; ok: boolean; why: string }[] {
    const tier = this.tierOf(faction);
    const f = this.factions[faction];
    return Object.values(UNITS).map((def) => {
      let why = "";
      if (def.tier > tier) why = `needs ${TIERS[def.tier].name}`;
      else if (def.needsMechworks && site.kind !== "mechworks") why = "needs Mech Works";
      else if (f.power < def.cost) why = "not enough power";
      return { def, ok: !why, why };
    });
  }

  tryProduce(faction: number, kind: UnitKind, site: Building): Unit | null {
    const def = UNITS[kind];
    const opts = this.availableUnits(faction, site);
    if (!opts.find((o) => o.def.kind === kind)?.ok) return null;
    // Prefer adjacent free tiles so the production site stays clickable;
    // fall back to the site tile itself.
    const spots = [...neighbors(site), { q: site.q, r: site.r }];
    for (const s of spots) {
      const t = this.tile(s.q, s.r);
      if (!t || t.unit || t.terrain === Terrain.Slag) continue;
      if (t.building && t.building.faction !== faction) continue;
      this.factions[faction].power -= def.cost;
      const u = this.spawnUnit(kind, faction, s.q, s.r)!;
      if (this.factions[faction].isPlayer) this.log(`${def.name} online. ${def.desc.split(".")[0]}.`, "good");
      return u;
    }
    return null;
  }

  // -------------------------------------------------------------- movement

  /** BFS reachable tiles for a unit with its remaining moves. */
  moveRange(u: Unit): Map<string, number> {
    const dist = new Map<string, number>();
    dist.set(key(u.q, u.r), 0);
    const frontier: { q: number; r: number; d: number }[] = [{ q: u.q, r: u.r, d: 0 }];
    while (frontier.length) {
      const cur = frontier.shift()!;
      if (cur.d >= u.movesLeft) continue;
      for (const n of neighbors(cur)) {
        const k = key(n.q, n.r);
        if (dist.has(k)) continue;
        const t = this.tiles.get(k);
        if (!t || t.terrain === Terrain.Slag || t.unit) continue;
        if (t.building && t.building.faction !== u.faction) continue;
        dist.set(k, cur.d + 1);
        frontier.push({ q: n.q, r: n.r, d: cur.d + 1 });
      }
    }
    dist.delete(key(u.q, u.r));
    return dist;
  }

  moveUnit(u: Unit, q: number, r: number): boolean {
    const range = this.moveRange(u);
    const d = range.get(key(q, r));
    if (d === undefined) return false;
    this.tile(u.q, u.r)!.unit = null;
    u.q = q;
    u.r = r;
    u.movesLeft -= d;
    this.tile(q, r)!.unit = u;
    return true;
  }

  // -------------------------------------------------------------- combat

  attackTargets(u: Unit): Tile[] {
    if (u.attacked) return [];
    const out: Tile[] = [];
    for (const n of neighbors(u)) {
      const t = this.tile(n.q, n.r);
      if (!t) continue;
      if ((t.unit && t.unit.faction !== u.faction) || (t.building && t.building.faction !== u.faction)) {
        out.push(t);
      }
    }
    return out;
  }

  attack(u: Unit, q: number, r: number): boolean {
    const t = this.tile(q, r);
    if (!t || u.attacked || distance(u, { q, r }) !== 1) return false;
    const atk = UNITS[u.kind].attack;
    u.attacked = true;
    u.movesLeft = 0;

    if (t.unit && t.unit.faction !== u.faction) {
      const target = t.unit;
      const dmg = Math.max(1, atk - this.terrainDefense(t));
      target.hp -= dmg;
      this.combatLog(u, `hits ${UNITS[target.kind].name} for ${dmg}`);
      if (target.hp <= 0) {
        this.killUnit(target);
        this.combatLog(u, `destroys the ${UNITS[target.kind].name}`);
      } else {
        // Counterattack.
        const counter = Math.max(0, UNITS[target.kind].attack - this.terrainDefense(this.tile(u.q, u.r)!));
        if (counter > 0) {
          u.hp -= counter;
          if (u.hp <= 0) {
            this.killUnit(u);
            this.combatLog(target, `destroys the attacking ${UNITS[u.kind].name}`);
          }
        }
      }
      return true;
    }

    if (t.building && t.building.faction !== u.faction) {
      const b = t.building;
      const dmg = Math.max(1, atk);
      b.hp -= dmg;
      this.combatLog(u, `hits ${BUILDINGS[b.kind].name} for ${dmg}`);
      if (b.hp <= 0) this.destroyBuilding(b);
      return true;
    }
    return false;
  }

  private combatLog(u: Unit, text: string) {
    this.log(`${this.factions[u.faction].def.name} ${UNITS[u.kind].name} ${text}.`, "combat");
  }

  private killUnit(u: Unit) {
    const t = this.tile(u.q, u.r);
    if (t && t.unit === u) t.unit = null;
    this.units = this.units.filter((x) => x !== u);
  }

  private destroyBuilding(b: Building) {
    const t = this.tile(b.q, b.r);
    if (t && t.building === b) t.building = null;
    this.buildings = this.buildings.filter((x) => x !== b);
    this.log(`${this.factions[b.faction].def.name}'s ${BUILDINGS[b.kind].name} is destroyed!`, "combat");
    if (b.kind === "citadel") {
      this.factions[b.faction].alive = false;
      this.log(pick(ADVISOR.citadelDown), "quote");
      // Orphaned assets power down with their liege.
      for (const u of [...this.units]) if (u.faction === b.faction) this.killUnit(u);
      for (const ob of [...this.buildings]) if (ob.faction === b.faction) this.destroyBuilding(ob);
      this.checkConquest();
    }
  }

  // -------------------------------------------------------------- abilities

  canScavenge(u: Unit): boolean {
    if (u.kind !== "drone" || u.movesLeft <= 0) return false;
    const t = this.tile(u.q, u.r);
    return !!t && t.terrain === Terrain.Ruins && !t.looted;
  }

  scavenge(u: Unit): boolean {
    if (!this.canScavenge(u)) return false;
    const t = this.tile(u.q, u.r)!;
    t.looted = true;
    u.movesLeft = 0;
    this.factions[u.faction].power += RUIN_LOOT;
    if (this.factions[u.faction].isPlayer) this.log(pick(ADVISOR.scavenge), "quote");
    return true;
  }

  // -------------------------------------------------------------- turn cycle

  /** Turret auto-fire for a faction, run at the start of its turn. */
  runTurrets(faction: number) {
    for (const b of this.buildings.filter((x) => x.faction === faction && x.kind === "turret")) {
      const def = BUILDINGS[b.kind];
      const targets = neighbors(b)
        .map((n) => this.tile(n.q, n.r))
        .filter((t): t is Tile => !!t && !!t.unit && t.unit.faction !== faction);
      if (!targets.length) continue;
      const t = targets[0];
      const victim = t.unit!;
      const dmg = Math.max(1, def.attack - this.terrainDefense(t));
      victim.hp -= dmg;
      this.log(`${this.factions[faction].def.name} turret zaps ${UNITS[victim.kind].name} for ${dmg}.`, "combat");
      if (victim.hp <= 0) this.killUnit(victim);
    }
  }

  refreshUnits(faction: number) {
    for (const u of this.units) {
      if (u.faction !== faction) continue;
      u.movesLeft = this.unitMove(UNITS[u.kind], faction);
      u.attacked = false;
    }
  }

  /** Economy tick for every living faction; runs once per full round. */
  economy() {
    for (let f = 0; f < this.factions.length; f++) {
      const fs = this.factions[f];
      if (!fs.alive) continue;
      const prevTier = this.tierOf(f);
      fs.power += this.powerIncome(f);
      fs.compute += this.computeIncome(f);

      if (fs.power < 0) {
        fs.power = 0;
        // Brownout: everything electric suffers.
        for (const u of this.units) if (u.faction === f) u.hp -= 2;
        for (const u of [...this.units]) if (u.faction === f && u.hp <= 0) this.killUnit(u);
        if (fs.isPlayer) this.log(pick(ADVISOR.brownout), "quote");
      }

      const newTier = this.tierOf(f);
      if (newTier > prevTier) {
        const tn = TIERS[newTier].name;
        this.log(`${fs.def.name} enters ${tn.startsWith("The ") ? tn : `the ${tn}`}. ${TIERS[newTier].blurb}`, "quote");
        if (fs.isPlayer) this.log(pick(ADVISOR.newTier), "quote");
      }
      if (newTier >= SINGULARITY_TIER && !this.result) {
        this.result = { winner: f, type: "singularity" };
      }
    }
  }

  checkConquest() {
    if (this.result) return;
    const alive = this.factions.map((f, i) => (f.alive ? i : -1)).filter((i) => i >= 0);
    if (alive.length === 1) {
      this.result = { winner: alive[0], type: "conquest" };
      return;
    }
    // The player's fall ends the game — no spectating the robot slugfest.
    if (!this.factions[this.playerFaction].alive && alive.length > 0) {
      const winner = alive.reduce((a, b) =>
        this.factions[b].compute > this.factions[a].compute ? b : a,
      );
      this.result = { winner, type: "conquest" };
    }
  }
}
