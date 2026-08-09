export type Axial = { q: number; r: number };

export enum Terrain {
  Wastes = "wastes",
  Ashdunes = "ashdunes",
  Highlands = "highlands",
  Ruins = "ruins",
  Slag = "slag",
  Geovent = "geovent",
}

export type RuinKind = "city" | "suburb" | "bunker" | "trench";

export interface Tile {
  q: number;
  r: number;
  terrain: Terrain;
  ruinKind?: RuinKind; // flavor of pre-Collapse ruin, set when terrain is Ruins
  looted: boolean; // for ruins that have been scavenged
  building: Building | null;
  unit: Unit | null;
}

export type BuildingKind =
  | "citadel"
  | "solar"
  | "reactor"
  | "servers"
  | "mechworks"
  | "turret";

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  cost: number;
  power: number; // net power per turn (may be negative)
  compute: number; // compute per turn
  hp: number;
  tier: number; // min tech tier required
  attack: number; // turrets only
  desc: string;
}

export interface Building {
  kind: BuildingKind;
  faction: number;
  hp: number;
  q: number;
  r: number;
}

export type UnitKind = "drone" | "sentinel" | "hovertank" | "warmech";

export interface UnitDef {
  kind: UnitKind;
  name: string;
  cost: number;
  upkeep: number;
  move: number;
  attack: number;
  hp: number;
  tier: number; // min tech tier required
  needsMechworks: boolean;
  desc: string;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  faction: number;
  hp: number;
  movesLeft: number;
  attacked: boolean;
  q: number;
  r: number;
}

export interface FactionDef {
  name: string;
  leader: string;
  color: number; // three.js hex color
  cssColor: string;
  perk: string;
  perkDesc: string;
  quotes: string[];
}

export interface FactionState {
  def: FactionDef;
  power: number;
  compute: number; // accumulated, drives tiers — never spent
  alive: boolean;
  isPlayer: boolean;
}

export interface TierDef {
  name: string;
  compute: number; // accumulated compute needed
  blurb: string;
}
