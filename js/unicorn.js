/* Enhörningar: slumpas fram och ritas helt med canvas — inga bildfiler.
   Stilen härmar sagoboken: tjock bläckkontur, rundade kroppar, stora ögon.

   Lokalt koordinatsystem när vi ritar (innan skalning):
     x = 0 mitt under kroppen, y = 0 vid hovarna, negativ y uppåt.
     Enhörningen tittar åt höger och är ca 160 enheter hög. */
(function (global) {
  'use strict';

  const INK = '#43302b';

  const BODY_COLORS = [
    '#f6a6bb', // rosa
    '#fdfbf7', // vit
    '#b7a4dd', // lila
    '#ffd98a', // gul
    '#9ad6e8', // ljusblå
    '#b5613f', // rödbrun
    '#a9dcc3', // mint
    '#f8c9a4', // persika
    '#e9e3f3', // syren
  ];

  const MANE_COLORS = [
    '#3f6fb5', // blå
    '#f2a03d', // orange
    '#e0567c', // rosa
    '#57bfa5', // turkos
    '#f2d64f', // gul
    '#8e6fb8', // lila
    '#e4503f', // röd
    '#6c4f9c', // mörklila
  ];

  const HORN_COLORS = [
    ['#f5a623', '#ffe4a3'], // orange (som i boken)
    ['#2fa898', '#bfeee4'], // turkos
    ['#3f7fc4', '#c7e2fb'], // blå
    ['#e8546a', '#ffd0d6'], // röd
    ['#c9a227', '#fff0b8'], // guld
  ];

  const HORN_TYPES = ['spiral', 'slat', 'trapp', 'bojt'];

  /* Namn så att barnet kan känna igen sina kompisar. */
  const NAMES = [
    'Stella', 'Kanel', 'Glitter', 'Bulle', 'Blåbär', 'Sockerdricka', 'Måne',
    'Prick', 'Smulan', 'Regnbåge', 'Sirap', 'Molnet', 'Pärlan', 'Knyckel',
    'Doris', 'Pluttan', 'Saga', 'Nova', 'Fluffis', 'Karamell', 'Vinter',
    'Solstråle', 'Tofsen', 'Hjärtat', 'Majken', 'Nubbe', 'Ärtan', 'Sylvia',
  ];

  /* ---------- skapa ---------- */

  function create(rng) {
    const body = rng.pick(BODY_COLORS);
    const mane = rng.pick(MANE_COLORS);
    let mane2 = rng.pick(MANE_COLORS);
    if (mane2 === mane) mane2 = shade(mane, 1.18);
    const horn = rng.pick(HORN_COLORS);

    /* Fläckar sprids över kroppen och klipps mot kroppens siluett. */
    const spots = [];
    const spotKind = rng.pick(['inga', 'inga', 'prickar', 'plumpar']);
    if (spotKind !== 'inga') {
      const count = rng.int(4, 9);
      for (let i = 0; i < count; i++) {
        spots.push({
          x: rng.range(-48, 20),
          y: rng.range(-98, -50),
          r: spotKind === 'prickar' ? rng.range(3, 5.5) : rng.range(7, 13),
        });
      }
    }

    return {
      name: rng.pick(NAMES),
      body,
      belly: shade(body, 1.07),
      far: shade(body, 0.86),
      hoof: shade(body, 0.7),
      mane,
      mane2,
      hornType: rng.pick(HORN_TYPES),
      hornColor: horn[0],
      hornColor2: horn[1],
      spots,
      spotColor: spotKind === 'prickar' ? shade(mane, 1.0) : shade(body, 0.82),
      freckles: rng.chance(0.5),
      blaze: rng.chance(0.35),
      scale: rng.range(0.82, 1.05),
      /* Egen takt på blinkningar och svansviftning. */
      phase: rng.range(0, Math.PI * 2),
      blinkAt: rng.range(1, 4),
    };
  }

  /* Ljusare (f > 1) eller mörkare (f < 1) variant av en hex-färg. */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v * f)));
    });
    return '#' + c.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  /* ---------- rita ---------- */

  function ink(ctx, w) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w || 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function fillStroke(ctx, fill, w) {
    ctx.fillStyle = fill;
    ctx.fill();
    ink(ctx, w);
    ctx.stroke();
  }

  /* Kroppens siluett: knubbig som i boken — rund mage, kort hals, stort huvud.
     Gump, rygg, hals, hjässa, nos, mule, haka, bringa och mage i ett enda drag. */
  function bodyPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-50, -88);
    ctx.bezierCurveTo(-34, -104, -6, -108, 14, -100);   // rygg
    ctx.bezierCurveTo(20, -114, 26, -128, 40, -140);    // halsens ovansida
    ctx.bezierCurveTo(50, -152, 68, -157, 82, -150);    // hjässa
    ctx.bezierCurveTo(98, -143, 107, -133, 107, -121);  // nosrygg
    ctx.bezierCurveTo(107, -108, 96, -101, 86, -104);   // nosens rundade spets
    ctx.bezierCurveTo(76, -106, 66, -108, 58, -112);    // mulen underifrån
    ctx.bezierCurveTo(50, -116, 43, -114, 40, -106);    // haka
    ctx.bezierCurveTo(38, -92, 36, -76, 36, -62);       // halsens framsida
    ctx.bezierCurveTo(36, -50, 20, -44, -4, -44);       // bringa
    ctx.bezierCurveTo(-28, -44, -48, -48, -56, -62);    // mage
    ctx.bezierCurveTo(-62, -72, -58, -80, -50, -88);    // gump
    ctx.closePath();
  }

  function leg(ctx, u, hipX, hipY, angle, len, color) {
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.rotate(angle);
    ctx.beginPath();
    roundRect(ctx, -6.5, -4, 13, len + 4, 6);
    fillStroke(ctx, color, 2.6);
    ctx.beginPath();
    roundRect(ctx, -7.5, len - 13, 15, 13, 5);
    fillStroke(ctx, u.hoof, 2.6);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Svansen: några vågiga tofsar som viftar. */
  function tail(ctx, u, t) {
    const sway = Math.sin(t * 2.2 + u.phase) * 8;
    const strands = [
      { color: u.mane, w: 17, dx: 0, dy: 0 },
      { color: u.mane2, w: 11, dx: -7, dy: 8 },
      { color: u.mane, w: 8, dx: 5, dy: 12 },
    ];
    ctx.lineCap = 'round';
    strands.forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(-52 + s.dx, -86 + s.dy);
      ctx.quadraticCurveTo(
        -84 + s.dx - sway * 0.4, -74 + s.dy,
        -78 + s.dx - sway, -28 + s.dy + Math.abs(sway) * 0.3
      );
      /* Bläckkonturen ritas som en bredare linje under färgen. */
      ctx.strokeStyle = INK;
      ctx.lineWidth = s.w + 5;
      ctx.stroke();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.w;
      ctx.stroke();
    });
  }

  /* Manen: yviga klumpar längs halsen och en lugg i pannan.
     De ritas i två svep — först en mörk kontur under alltihop, sedan färgen.
     Då smälter klumparna ihop till en enda vågig man i stället för ett pärlband. */
  function mane(ctx, u, t) {
    const wob = Math.sin(t * 3 + u.phase) * 2.5;
    const blobs = [
      { x: -2, y: -94, r: 16 },
      { x: 8, y: -107, r: 17 },
      { x: 19, y: -119, r: 16 },
      { x: 30, y: -131, r: 15 },
      { x: 42, y: -142, r: 14 },
      { x: 57, y: -150, r: 12 }, // lugg
      { x: 71, y: -142, r: 8 },
    ];
    const placed = blobs.map(function (b, i) {
      return {
        x: b.x + (i % 2 ? 4 : -4),
        y: b.y + wob * (0.3 + i / blobs.length),
        r: b.r,
        color: i % 2 ? u.mane2 : u.mane,
      };
    });

    ctx.fillStyle = INK;
    placed.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 2.8, 0, Math.PI * 2);
      ctx.fill();
    });
    placed.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
    });
  }

  /* Fyra hornsorter, precis som i boken. */
  function horn(ctx, u) {
    ctx.save();
    ctx.translate(56, -150);
    ctx.rotate(0.34); // lutar framåt

    const L = 54;
    if (u.hornType === 'bojt') {
      /* Böjt horn: en bred skära. */
      ctx.beginPath();
      ctx.moveTo(-9, 2);
      ctx.quadraticCurveTo(-2, -34, 22, -46);
      ctx.quadraticCurveTo(6, -30, 7, 2);
      ctx.closePath();
      fillStroke(ctx, u.hornColor, 2.6);
    } else if (u.hornType === 'trapp') {
      /* Trapphorn: växer i steg. */
      ctx.beginPath();
      ctx.moveTo(-9, 2);
      let x = -9, y = 2;
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const nx = -9 + ((i + 1) / steps) * 8;
        y -= L / steps;
        ctx.lineTo(nx - 3, y + 4);
        ctx.lineTo(nx, y);
        x = nx;
      }
      ctx.lineTo(x + 6, y + 2);
      for (let i = steps - 1; i >= 0; i--) {
        const nx = 9 - ((i + 1) / steps) * 8;
        y += L / steps;
        ctx.lineTo(nx + 3, y - 4);
        ctx.lineTo(nx, y);
      }
      ctx.closePath();
      fillStroke(ctx, u.hornColor, 2.6);
    } else {
      /* Slätt eller spiralformat horn: samma kon, olika mönster. */
      ctx.beginPath();
      ctx.moveTo(-9, 2);
      ctx.quadraticCurveTo(-3, -26, 1, -L);
      ctx.quadraticCurveTo(6, -26, 9, 2);
      ctx.closePath();
      fillStroke(ctx, u.hornColor, 2.6);

      if (u.hornType === 'spiral') {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = u.hornColor2;
        ctx.lineWidth = 5;
        for (let i = 0; i < 6; i++) {
          const y = 0 - i * (L / 6);
          ctx.beginPath();
          ctx.moveTo(-12, y);
          ctx.lineTo(12, y - 7);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        /* Slätt horn: en blank dager längs kanten. */
        ctx.beginPath();
        ctx.moveTo(-3, -2);
        ctx.quadraticCurveTo(-1, -24, 0.5, -L + 6);
        ctx.strokeStyle = u.hornColor2;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function head(ctx, u, t, blink) {
    /* Öra, som sticker upp bakom luggen. */
    ctx.beginPath();
    ctx.moveTo(40, -136);
    ctx.quadraticCurveTo(34, -168, 52, -160);
    ctx.quadraticCurveTo(57, -150, 56, -140);
    ctx.closePath();
    fillStroke(ctx, u.body, 2.6);
    ctx.beginPath();
    ctx.moveTo(43, -140);
    ctx.quadraticCurveTo(41, -158, 50, -155);
    ctx.quadraticCurveTo(52, -148, 51, -142);
    ctx.closePath();
    ctx.fillStyle = shade(u.mane, 1.35);
    ctx.fill();

    /* Bläs längs nosryggen. */
    if (u.blaze) {
      ctx.save();
      bodyPath(ctx);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(84, -150);
      ctx.quadraticCurveTo(102, -136, 100, -108);
      ctx.quadraticCurveTo(88, -114, 78, -140);
      ctx.closePath();
      ctx.fillStyle = shade(u.body, 1.13);
      ctx.fill();
      ctx.restore();
    }

    /* Öga: stor vit ring med rund pupill, precis som i boken. */
    const ex = 78, ey = -128;
    const open = blink ? 0.12 : 1;
    ctx.beginPath();
    ctx.ellipse(ex, ey, 12, 12 * open, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#ffffff', 2.8);
    if (!blink) {
      ctx.beginPath();
      ctx.arc(ex + 3, ey + 1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1f1c';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + 1.2, ey - 1.4, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    /* Ögonfransar snett uppåt mot nosen. */
    ink(ctx, 2.6);
    for (let i = 0; i < 3; i++) {
      const a = -1.45 + i * 0.4;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a) * 11, ey + Math.sin(a) * 11);
      ctx.lineTo(ex + Math.cos(a) * 19, ey + Math.sin(a) * 19);
      ctx.stroke();
    }

    /* Fräknar på kinden. */
    if (u.freckles) {
      ctx.fillStyle = shade(u.mane, 1.3);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(86 + (i % 2) * 6, -122 + i * 4, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Näsborre och litet leende. */
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(99, -116, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ink(ctx, 2.2);
    ctx.beginPath();
    ctx.arc(94, -110, 4.5, -0.3, 1.5);
    ctx.stroke();
  }

  /* opts: { x, y, facing (1/-1), walk (radianer), flying, t } */
  function draw(ctx, u, opts) {
    const t = opts.t || 0;
    const facing = opts.facing < 0 ? -1 : 1;
    const flying = !!opts.flying;
    const walk = opts.walk || 0;

    /* Blinkar då och då, var sjätte sekund i sin egen takt. */
    const blinkCycle = (t + u.blinkAt) % 6;
    const blink = blinkCycle < 0.14;

    /* Kroppen guppar när den går, och vaggar mjukt när den flyger. */
    const bob = flying
      ? Math.sin(t * 2.6 + u.phase) * 4
      : Math.abs(Math.sin(walk)) * 3;
    const tilt = flying ? Math.sin(t * 1.7 + u.phase) * 0.05 : 0;

    ctx.save();
    ctx.translate(opts.x, opts.y);
    ctx.scale(facing * u.scale, u.scale);
    ctx.translate(0, -bob);
    ctx.rotate(tilt);

    const swing = flying ? 0.25 : 0.42;
    const legs = [
      { x: -40, y: -54, p: 0 },          // bakben, bortre
      { x: 12, y: -56, p: Math.PI },     // framben, bortre
      { x: -30, y: -50, p: Math.PI },    // bakben, närmre
      { x: 24, y: -52, p: 0 },           // framben, närmre
    ];

    /* Benets längd är avståndet ner till marken, så hovarna hamnar rätt. */
    function benVinkel(l) {
      return flying
        ? -0.55 + Math.sin(t * 3 + l.p) * swing * 0.4
        : Math.sin(walk + l.p) * swing;
    }

    /* Bortre benparet först, i mörkare ton. */
    for (let i = 0; i < 2; i++) {
      const l = legs[i];
      leg(ctx, u, l.x, l.y, benVinkel(l), -l.y, u.far);
    }

    tail(ctx, u, t);

    /* Närmre benparet. */
    for (let i = 2; i < 4; i++) {
      const l = legs[i];
      leg(ctx, u, l.x, l.y, benVinkel(l), -l.y, u.body);
    }

    /* Kropp + hals + huvud i en enda siluett. */
    bodyPath(ctx);
    fillStroke(ctx, u.body, 3.2);

    /* Ljusare mage och fläckar, klippta mot siluetten. */
    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-16, -46, 32, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = u.belly;
    ctx.fill();
    ctx.fillStyle = u.spotColor;
    u.spots.forEach(function (s) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    head(ctx, u, t, blink);
    horn(ctx, u);
    mane(ctx, u, t);

    ctx.restore();
  }

  global.Unicorn = { create, draw, shade, BODY_COLORS, MANE_COLORS, HORN_TYPES, INK };
})(window);
