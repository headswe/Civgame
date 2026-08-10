/* Världen: himmel, kullar, mark och allt som växer i den.
   Marken är en matematisk kurva, så världen kan fortsätta hur långt som helst
   åt både vänster och höger. Innehållet delas in i "chunks" om 640 pixlar och
   slumpas fram med chunkens nummer som frö — samma bit ser alltid likadan ut. */
(function (global) {
  'use strict';

  const CHUNK = 640;
  const GROUND_Y = 0; // världens "marknivå"; kameran flyttar oss dit vi tittar

  function groundY(x) {
    return (
      GROUND_Y +
      Math.sin(x / 420) * 26 +
      Math.sin(x / 170 + 2.1) * 14 +
      Math.sin(x / 93 + 0.6) * 7
    );
  }

  /* ---------- innehåll per chunk ---------- */

  const chunks = new Map();

  function getChunk(i) {
    if (chunks.has(i)) return chunks.get(i);

    const rng = Rng(hashSeed(i));
    const x0 = i * CHUNK;
    const decor = [];
    const items = [];

    const decorCount = rng.int(4, 7);
    for (let d = 0; d < decorCount; d++) {
      const x = x0 + rng.range(0, CHUNK);
      decor.push({
        x,
        type: rng.pick(['buske', 'buske', 'blomma', 'blomma', 'sten', 'trad']),
        s: rng.range(0.7, 1.3),
        c: rng.next(),
      });
    }

    const itemCount = rng.int(2, 4);
    for (let k = 0; k < itemCount; k++) {
      const x = x0 + rng.range(40, CHUNK - 40);
      items.push({
        id: i + ':' + k,
        x,
        y: groundY(x) - rng.range(40, 230),
        type: rng.pick(['glitter', 'glitter', 'hjarta', 'ballong']),
        hue: rng.pick(['#f06292', '#ffb74d', '#7fd4ec', '#f6e05e', '#b39ddb', '#ff8a65']),
        phase: rng.range(0, Math.PI * 2),
        taken: false,
      });
    }

    /* Ungefär varannan bit har en kompis som strosar omkring. */
    let friend = null;
    if (rng.chance(0.55)) {
      const hx = x0 + rng.range(80, CHUNK - 80);
      friend = {
        id: 'f' + i,
        unicorn: Unicorn.create(Rng(hashSeed(i * 7919 + 13))),
        homeX: hx,
        x: hx,
        y: groundY(hx),
        dir: rng.chance(0.5) ? 1 : -1,
        speed: rng.range(20, 45),
        walk: rng.range(0, 6),
        joined: false,
      };
    }

    const chunk = { i, decor, items, friend };
    chunks.set(i, chunk);
    return chunk;
  }

  /* Alla chunks som syns just nu (plus en bit marginal åt varje håll). */
  function visibleChunks(camX, width) {
    const first = Math.floor((camX - CHUNK) / CHUNK);
    const last = Math.floor((camX + width + CHUNK) / CHUNK);
    const list = [];
    for (let i = first; i <= last; i++) list.push(getChunk(i));
    return list;
  }

  /* ---------- bakgrund ---------- */

  function drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#bfe6f5');
    g.addColorStop(0.55, '#dff0f2');
    g.addColorStop(1, '#f5efdc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawSun(ctx, W, t) {
    const x = W - 110, y = 96;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(x, y, 64 + Math.sin(t * 0.8) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(x, y, 42, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Moln och kullar ritas ur samma kurvor som marken, fast långsammare —
     det ger djup utan att vi behöver spara några objekt. */
  function drawClouds(ctx, camX, camY, W, t) {
    const p = camX * 0.15;
    /* Molnen sjunker en liten aning när man flyger uppåt. */
    const vy = -camY * 0.12 - 55;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let n = -1; n < W / 260 + 2; n++) {
      const base = Math.floor((p + n * 260) / 260);
      const r = Rng(hashSeed(base * 31 + 5));
      const cx = base * 260 + r.range(0, 200) - p;
      const cy = 40 + r.range(0, 120) + vy + Math.sin(t * 0.4 + base) * 4;
      const s = r.range(0.6, 1.2);
      ctx.beginPath();
      ctx.arc(cx, cy, 26 * s, 0, Math.PI * 2);
      ctx.arc(cx + 28 * s, cy + 6 * s, 20 * s, 0, Math.PI * 2);
      ctx.arc(cx - 26 * s, cy + 8 * s, 17 * s, 0, Math.PI * 2);
      ctx.arc(cx + 6 * s, cy - 16 * s, 19 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* Kullar i fjärran. De hänger ihop med markens horisont men rör sig
     långsammare i sidled, vilket ger djup. `lyft` är hur högt de reser sig. */
  function drawHills(ctx, camX, camY, W, H, parallax, lyft, amp, color) {
    const p = camX * parallax;
    const horisont = -camY * 0.94;
    ctx.beginPath();
    ctx.moveTo(-2, H + 2);
    for (let sx = -2; sx <= W + 2; sx += 10) {
      const wx = sx + p;
      const y =
        horisont - lyft +
        Math.sin(wx / 340) * amp +
        Math.sin(wx / 127 + 1.7) * amp * 0.35;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W + 2, H + 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ---------- mark ---------- */

  function drawGround(ctx, camX, camY, W, H) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-2, H + 2);
    for (let sx = -2; sx <= W + 2; sx += 8) {
      ctx.lineTo(sx, groundY(sx + camX) - camY);
    }
    ctx.lineTo(W + 2, H + 2);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7cb98f');
    g.addColorStop(1, '#4f8d6b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#3f6b52';
    ctx.lineWidth = 4;
    ctx.stroke();

    /* Prickig gräsyta i samma anda som bokens målning. */
    ctx.clip();
    ctx.fillStyle = 'rgba(58,105,80,0.35)';
    const step = 26;
    const start = Math.floor(camX / step) * step;
    for (let wx = start; wx < camX + W + step; wx += step) {
      for (let n = 0; n < 3; n++) {
        const r = Rng(hashSeed((wx / step) * 17 + n));
        const gy = groundY(wx) + r.range(14, 150);
        ctx.beginPath();
        ctx.arc(wx - camX + r.range(0, step), gy - camY, r.range(1.5, 3.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---------- utsmyckning ---------- */

  function drawDecor(ctx, d, sx, sy) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(d.s, d.s);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3f6b52';
    ctx.lineWidth = 2.5;

    if (d.type === 'buske') {
      ctx.fillStyle = d.c > 0.5 ? '#2f5a45' : '#3c6b52';
      ctx.beginPath();
      ctx.arc(-14, -10, 14, 0, Math.PI * 2);
      ctx.arc(2, -18, 18, 0, Math.PI * 2);
      ctx.arc(18, -9, 13, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.type === 'sten') {
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.quadraticCurveTo(-16, -18, 0, -20);
      ctx.quadraticCurveTo(18, -20, 18, 0);
      ctx.closePath();
      ctx.fillStyle = '#c3ccd0';
      ctx.fill();
      ctx.stroke();
    } else if (d.type === 'trad') {
      ctx.fillStyle = '#7a4b3a';
      ctx.fillRect(-6, -46, 12, 46);
      ctx.strokeStyle = '#43302b';
      ctx.strokeRect(-6, -46, 12, 46);
      ctx.beginPath();
      ctx.arc(-16, -58, 20, 0, Math.PI * 2);
      ctx.arc(10, -66, 24, 0, Math.PI * 2);
      ctx.arc(22, -48, 17, 0, Math.PI * 2);
      ctx.fillStyle = '#3c7a58';
      ctx.fill();
      ctx.strokeStyle = '#2c5a41';
      ctx.stroke();
    } else {
      /* Blomma: strå med kronblad, som maskrosorna i boken. */
      const petal = d.c > 0.66 ? '#f7d774' : d.c > 0.33 ? '#f2a0bd' : '#ffffff';
      ctx.strokeStyle = '#3f6b52';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(4, -14, 0, -26);
      ctx.stroke();
      ctx.fillStyle = petal;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 6, -26 + Math.sin(a) * 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f6c445';
      ctx.beginPath();
      ctx.arc(0, -26, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- saker att samla ---------- */

  function drawItem(ctx, it, sx, sy, t) {
    const float = Math.sin(t * 2 + it.phase) * 6;
    ctx.save();
    ctx.translate(sx, sy + float);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = Unicorn.INK;
    ctx.lineWidth = 2.4;

    if (it.type === 'ballong') {
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.quadraticCurveTo(6, 30, 0, 44);
      ctx.strokeStyle = '#6b6b6b';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = Unicorn.INK;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 18, 0, 0, Math.PI * 2);
      ctx.fillStyle = it.hue;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-5, -6, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
    } else if (it.type === 'hjarta') {
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.bezierCurveTo(-20, -2, -13, -20, 0, -8);
      ctx.bezierCurveTo(13, -20, 20, -2, 0, 14);
      ctx.closePath();
      ctx.fillStyle = it.hue;
      ctx.fill();
      ctx.stroke();
    } else {
      /* Glitterstjärna. */
      ctx.rotate(t * 1.5 + it.phase);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 15 : 6.5;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = it.hue;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  global.World = {
    CHUNK,
    groundY,
    getChunk,
    visibleChunks,
    drawSky,
    drawSun,
    drawClouds,
    drawHills,
    drawGround,
    drawDecor,
    drawItem,
  };
})(window);
