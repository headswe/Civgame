/* Liten deterministisk slumpgenerator (mulberry32).
   Samma frö ger alltid samma enhörning / samma värld. */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Hashar ett heltal till ett nytt frö, så att chunk 7 och chunk 8
     inte ger snarlika serier. */
  function hash(n) {
    let h = (n | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function Rng(seed) {
    const next = mulberry32(seed);
    return {
      next,
      /* Flyttal i [min, max) */
      range(min, max) {
        return min + next() * (max - min);
      },
      /* Heltal i [min, max] */
      int(min, max) {
        return Math.floor(min + next() * (max - min + 1));
      },
      pick(list) {
        return list[Math.floor(next() * list.length)];
      },
      chance(p) {
        return next() < p;
      },
    };
  }

  global.Rng = Rng;
  global.hashSeed = hash;
})(window);
