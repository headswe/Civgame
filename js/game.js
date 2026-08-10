/* Spelet: en lugn side scroller där man går och flyger åt vänster och höger,
   plockar glitter och samlar på sig kompisar. Man kan inte förlora. */
(function () {
  'use strict';

  const canvas = document.getElementById('spel');
  const ctx = canvas.getContext('2d');

  /* W/H är skärmen i CSS-pixlar. VW/VH är hur mycket av världen som syns:
     på en liten skärm zoomar vi ut så att man ser ungefär lika mycket äng
     som på en stor, i stället för en jättestor enhörning i närbild. */
  let W = 0, H = 0, VW = 0, VH = 0, zoom = 1, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    zoom = Math.max(0.45, Math.min(1.2, Math.min(H / 620, W / 900)));
    VW = W / zoom;
    VH = H / zoom;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- spelarens enhörning ---------- */

  const player = {
    unicorn: null,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    walk: 0,
    onGround: true,
  };

  function nyEnhorning() {
    player.unicorn = Unicorn.create(Rng((Math.random() * 1e9) | 0));
    document.getElementById('namn').textContent = player.unicorn.name;
    document.getElementById('start-namn').textContent = player.unicorn.name;
  }

  const state = {
    glitter: 0,
    friends: [],       // kompisar som gått med i tåget
    trail: [],         // spelarens spår, så kompisarna kan följa efter
    particles: [],
    floaters: [],      // små texter som "Hej Stella!"
    taken: new Set(),  // upplockade saker, så de inte kommer tillbaka
    t: 0,
    running: false,
    ljud: true,
  };

  /* ---------- styrning ---------- */

  const keys = { left: false, right: false, up: false, down: false };

  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
  };

  window.addEventListener('keydown', function (e) {
    const k = KEYMAP[e.key];
    if (k) { keys[k] = true; e.preventDefault(); }
    /* Mellanslag eller enter startar spelet från startskärmen. */
    if (!state.running && (e.key === ' ' || e.key === 'Enter')) starta();
  });

  /* Om fönstret tappar fokus mitt i ett tangenttryck fastnar annars riktningen. */
  window.addEventListener('blur', function () {
    keys.left = keys.right = keys.up = keys.down = false;
  });
  window.addEventListener('keyup', function (e) {
    const k = KEYMAP[e.key];
    if (k) { keys[k] = false; e.preventDefault(); }
  });

  /* Pekknappar för surfplatta och telefon. */
  document.querySelectorAll('[data-knapp]').forEach(function (el) {
    const dir = el.getAttribute('data-knapp');
    const on = function (e) { keys[dir] = true; el.classList.add('nedtryckt'); e.preventDefault(); };
    const off = function (e) { keys[dir] = false; el.classList.remove('nedtryckt'); e.preventDefault(); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  });

  /* ---------- ljud ---------- */

  let audio = null;
  function pling(freq, dur, typ) {
    if (!state.ljud) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = typ || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + dur + 0.02);
    } catch (e) { /* ljud är bonus, aldrig ett hinder */ }
  }

  /* ---------- kamera ---------- */

  const cam = { x: 0, y: 0 };

  /* ---------- effekter ---------- */

  const REGNBAGE = ['#f06292', '#ffb74d', '#f6e05e', '#7bd389', '#7fd4ec', '#b39ddb'];

  function gnistor(x, y, color, antal) {
    for (let i = 0; i < (antal || 14); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 170;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.6 + Math.random() * 0.6,
        max: 1.2,
        r: 2 + Math.random() * 3.5,
        color,
      });
    }
  }

  function svavaText(x, y, text) {
    state.floaters.push({ x, y, text, life: 2.2 });
  }

  /* ---------- uppdatering ---------- */

  const FART = 265;      // hur fort man springer
  const GRAVITATION = 950;
  const LYFT = 1750;     // kraft uppåt när man håller upp
  const MAX_LYFT = 330;
  const LEDLUCKA = 16;   // avstånd i spårpunkter mellan kompisarna i tåget

  /* Hur högt man får flyga anpassas efter skärmen, så att man aldrig
     försvinner ut genom överkanten på en liten skärm. */
  function takhojd() {
    return Math.min(430, VH * 0.58);
  }

  function update(dt) {
    state.t += dt;

    /* Vänster och höger. */
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir !== 0) {
      player.vx += dir * 2200 * dt;
      player.facing = dir;
    } else {
      player.vx *= Math.pow(0.0016, dt); // mjuk inbromsning
      if (Math.abs(player.vx) < 4) player.vx = 0;
    }
    player.vx = Math.max(-FART, Math.min(FART, player.vx));
    player.x += player.vx * dt;

    /* Upp och ner: håll upp för att flyga, ner för att dyka. */
    if (keys.up) player.vy -= LYFT * dt;
    if (keys.down) player.vy += 1500 * dt;
    player.vy += GRAVITATION * dt;
    player.vy = Math.max(-MAX_LYFT, Math.min(560, player.vy));
    player.y += player.vy * dt;

    const gy = World.groundY(player.x);
    const tak = gy - takhojd();
    if (player.y < tak) { player.y = tak; player.vy = Math.max(player.vy, 0); }
    if (player.y >= gy) {
      if (!player.onGround && player.vy > 260) {
        gnistor(player.x, gy, '#cfe8d6', 8);
      }
      player.y = gy;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    if (player.onGround) {
      player.walk += Math.abs(player.vx) * dt * 0.055;
    } else if (Math.random() < dt * 26) {
      /* Ett litet glitterspår efter den som flyger. */
      state.particles.push({
        x: player.x - player.facing * 40 + (Math.random() - 0.5) * 20,
        y: player.y - 70 + (Math.random() - 0.5) * 40,
        vx: -player.vx * 0.15,
        vy: 12 + Math.random() * 20,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        r: 1.5 + Math.random() * 2.5,
        color: REGNBAGE[(Math.random() * REGNBAGE.length) | 0],
      });
    }

    /* Spåret som kompisarna följer. Vi sparar en punkt per bit vi förflyttat oss
       (inte per bildruta) — då står tåget kvar snyggt uppradat även när man
       stannar helt still. */
    const sista = state.trail[0];
    if (!sista || Math.hypot(player.x - sista.x, player.y - sista.y) > 9) {
      state.trail.unshift({ x: player.x, y: player.y, facing: player.facing, onGround: player.onGround });
      const max = LEDLUCKA * (state.friends.length + 1) + 4;
      while (state.trail.length > max) state.trail.pop();
    }

    state.friends.forEach(function (f, i) {
      const p = state.trail[Math.min(state.trail.length - 1, (i + 1) * LEDLUCKA)];
      if (!p) return;
      const fart = Math.min(1, dt * 6);
      f.x += (p.x - f.x) * fart;
      f.y += (p.y - f.y) * fart;
      f.facing = p.facing;
      f.flying = !p.onGround;
      f.walk += Math.abs(p.x - f.x) * dt * 0.5 + dt * 3.5;
    });

    /* Saker att plocka och kompisar att hälsa på. */
    World.visibleChunks(cam.x, VW).forEach(function (chunk) {
      chunk.items.forEach(function (it) {
        if (state.taken.has(it.id)) return;
        const float = Math.sin(state.t * 2 + it.phase) * 6;
        const dx = it.x - player.x;
        const dy = (it.y + float) - (player.y - 90);
        if (dx * dx + dy * dy < 62 * 62) {
          state.taken.add(it.id);
          state.glitter += it.type === 'glitter' ? 1 : 3;
          gnistor(it.x, it.y + float, it.hue, it.type === 'glitter' ? 14 : 22);
          pling(it.type === 'glitter' ? 880 : 1180, 0.18);
          uppdateraHud();
        }
      });

      const f = chunk.friend;
      if (f && !f.joined) {
        /* Strosar fram och tillbaka runt sitt hem. */
        f.x += f.dir * f.speed * dt;
        if (f.x > f.homeX + 150) f.dir = -1;
        if (f.x < f.homeX - 150) f.dir = 1;
        f.y = World.groundY(f.x);
        f.walk += f.speed * dt * 0.055;

        const dx = f.x - player.x;
        const dy = f.y - player.y;
        if (dx * dx + dy * dy < 80 * 80) {
          f.joined = true;
          f.flying = false;
          state.friends.push(f);
          gnistor(f.x, f.y - 110, '#ffd166', 26);
          svavaText(f.x, f.y - 190, 'Hej ' + f.unicorn.name + '!');
          pling(660, 0.14);
          setTimeout(function () { pling(990, 0.22); }, 110);
          uppdateraHud();
        }
      }
    });

    /* Partiklar och texter. */
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
    }
    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 22 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }

    /* Kameran följer mjukt efter. Den hålls inom ett spann så att marken
       alltid syns nertill — man ska aldrig sväva i bara blå himmel. */
    const målX = player.x - VW / 2;
    let målY = player.y - VH * 0.70;
    const högsta = gy - VH * 1.0;   // marken precis vid nederkanten
    const lägsta = gy - VH * 0.55;  // marken en bit upp i bild
    målY = Math.max(högsta, Math.min(lägsta, målY));
    cam.x += (målX - cam.x) * Math.min(1, dt * 4.5);
    cam.y += (målY - cam.y) * Math.min(1, dt * 3.5);
  }

  /* ---------- rendering ---------- */

  function render() {
    /* All ritning sker i världens enheter; här skalas de till skärmen. */
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    World.drawSky(ctx, VW, VH);
    World.drawSun(ctx, VW, state.t);
    World.drawClouds(ctx, cam.x, cam.y, VW, state.t);
    World.drawHills(ctx, cam.x, cam.y, VW, VH, 0.22, 132, 34, '#a9cabe');
    World.drawHills(ctx, cam.x, cam.y, VW, VH, 0.45, 74, 24, '#84b39c');
    World.drawGround(ctx, cam.x, cam.y, VW, VH);

    const chunks = World.visibleChunks(cam.x, VW);

    chunks.forEach(function (chunk) {
      chunk.decor.forEach(function (d) {
        World.drawDecor(ctx, d, d.x - cam.x, World.groundY(d.x) - cam.y);
      });
    });

    chunks.forEach(function (chunk) {
      chunk.items.forEach(function (it) {
        if (state.taken.has(it.id)) return;
        World.drawItem(ctx, it, it.x - cam.x, it.y - cam.y, state.t);
      });
      const f = chunk.friend;
      if (f && !f.joined) {
        Unicorn.draw(ctx, f.unicorn, {
          x: f.x - cam.x, y: f.y - cam.y,
          facing: f.dir, walk: f.walk, flying: false, t: state.t,
        });
      }
    });

    /* Kompiståget ritas bakom spelaren, sist i ledet först. */
    for (let i = state.friends.length - 1; i >= 0; i--) {
      const f = state.friends[i];
      Unicorn.draw(ctx, f.unicorn, {
        x: f.x - cam.x, y: f.y - cam.y,
        facing: f.facing, walk: f.walk, flying: f.flying, t: state.t,
      });
    }

    Unicorn.draw(ctx, player.unicorn, {
      x: player.x - cam.x, y: player.y - cam.y,
      facing: player.facing, walk: player.walk,
      flying: !player.onGround, t: state.t,
    });

    state.particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    state.floaters.forEach(function (f) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 1.2));
      ctx.font = '700 26px Nunito, Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(f.text, f.x - cam.x, f.y - cam.y);
      ctx.fillStyle = '#5b3d8f';
      ctx.fillText(f.text, f.x - cam.x, f.y - cam.y);
    });
    ctx.globalAlpha = 1;
  }

  /* ---------- HUD ---------- */

  function uppdateraHud() {
    document.getElementById('glitter').textContent = state.glitter;
    document.getElementById('kompisar').textContent = state.friends.length;
  }

  /* ---------- slinga ---------- */

  let förra = 0;
  function loop(nu) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (nu - förra) / 1000 || 0);
    förra = nu;
    if (state.running) update(dt);
    render();
  }

  /* ---------- start ---------- */

  const startruta = document.getElementById('start');

  function starta() {
    startruta.classList.add('dold');
    state.running = true;
    if (audio && audio.state === 'suspended') audio.resume();
  }

  document.getElementById('spela').addEventListener('click', function () {
    this.blur(); // annars kan mellanslag råka trycka på knappen igen
    starta();
  });
  document.getElementById('slumpa').addEventListener('click', function () {
    nyEnhorning();
    ritaForhandsvisning();
    pling(760, 0.12);
  });
  document.getElementById('ljud').addEventListener('click', function () {
    state.ljud = !state.ljud;
    this.textContent = state.ljud ? '🔊' : '🔇';
    if (state.ljud) pling(880, 0.12);
  });

  /* Liten förhandsvisning av enhörningen på startskärmen. */
  const preview = document.getElementById('forhandsvisning');
  const pctx = preview.getContext('2d');
  const PREV_W = preview.width, PREV_H = preview.height;
  preview.width = PREV_W * dpr;
  preview.height = PREV_H * dpr;
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  function ritaForhandsvisning() {
    const w = PREV_W, h = PREV_H;
    pctx.clearRect(0, 0, w, h);
    pctx.save();
    pctx.translate(w / 2 - 20, h - 14);
    pctx.scale(0.92, 0.92);
    Unicorn.draw(pctx, player.unicorn, {
      x: 0, y: 0, facing: 1, walk: 0, flying: false, t: state.t,
    });
    pctx.restore();
  }

  player.x = 0;
  player.y = World.groundY(0);
  cam.x = player.x - VW / 2;
  cam.y = player.y - VH * 0.70;
  nyEnhorning();
  uppdateraHud();
  ritaForhandsvisning();
  setInterval(function () { if (!state.running) { state.t += 0.1; ritaForhandsvisning(); } }, 100);
  requestAnimationFrame(loop);
})();
