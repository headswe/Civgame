import type { Axial } from "./types";

export const HEX_SIZE = 1;

// Pointy-top axial hex grid.
export const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function key(q: number, r: number): string {
  return `${q},${r}`;
}

export function neighbors(a: Axial): Axial[] {
  return DIRS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

export function distance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Axial -> world position (x, z) for pointy-top hexes. */
export function toWorld(a: Axial): { x: number; z: number } {
  const x = HEX_SIZE * Math.sqrt(3) * (a.q + a.r / 2);
  const z = HEX_SIZE * 1.5 * a.r;
  return { x, z };
}
