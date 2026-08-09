import * as THREE from "three";
import { Terrain, type Building, type Tile, type Unit } from "./types";
import { FACTIONS, UNITS } from "./content";
import { toWorld } from "./hex";
import type { Game } from "./game";

// Hex circumradius. At exactly 1 the flats of neighboring hexes touch
// (centers are √3 apart, apothem is √3/2); a hair under leaves a seam line
// without visible gaps.
const TILE_R = 0.995;

const TERRAIN_STYLE: Record<Terrain, { color: number; height: number }> = {
  [Terrain.Wastes]: { color: 0x8a7355, height: 0.3 },
  [Terrain.Ashdunes]: { color: 0x6e6a63, height: 0.36 },
  [Terrain.Highlands]: { color: 0x7d6b52, height: 0.72 },
  [Terrain.Ruins]: { color: 0x5e6470, height: 0.42 },
  [Terrain.Slag]: { color: 0x2b1812, height: 0.16 },
  [Terrain.Geovent]: { color: 0x6b5a48, height: 0.38 },
};

export class SceneView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;

  private terrainGroup = new THREE.Group();
  private dynamicGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();
  private cloudGroup = new THREE.Group();
  private tileMeshes = new Map<string, THREE.Mesh>();
  private fogUniforms = { uTime: { value: 0 } };
  private fogField: THREE.DataTexture | null = null;
  private fogFieldData: Uint8Array | null = null;
  private worldBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  private static readonly FIELD_RES = 128;
  private tileDecor = new Map<string, THREE.Mesh[]>();
  private tileTops = new Map<string, number>();
  private animated: { obj: THREE.Object3D; base: number; phase: number; amp: number }[] = [];
  private selectionRing: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private frustum = 14;
  private camTarget = new THREE.Vector3();
  private startTime = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      // Privacy-hardened browsers (fingerprinting resistance) or disabled
      // hardware acceleration can reject the first attempt; try the most
      // conservative settings before giving up.
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
      });
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(0x241812);
    this.scene.fog = new THREE.Fog(0x241812, 40, 90);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Dusty apocalypse lighting.
    const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
    sun.position.set(14, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x8899bb, 0x3a2a1a, 0.9));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    this.scene.add(this.terrainGroup, this.dynamicGroup, this.highlightGroup, this.cloudGroup);

    const ringGeo = new THREE.TorusGeometry(0.62, 0.05, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    this.selectionRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.setupControls();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.left = -this.frustum * aspect;
    this.camera.right = this.frustum * aspect;
    this.camera.top = this.frustum;
    this.camera.bottom = -this.frustum;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera() {
    // Classic isometric-ish angle.
    const dir = new THREE.Vector3(1, 1.15, 1).normalize().multiplyScalar(50);
    this.camera.position.copy(this.camTarget).add(dir);
    this.camera.lookAt(this.camTarget);
  }

  centerOn(q: number, r: number) {
    const { x, z } = toWorld({ q, r });
    this.camTarget.set(x, 0, z);
    this.updateCamera();
  }

  private setupControls() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.button === 2 || e.button === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    window.addEventListener("pointerup", () => (dragging = false));
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const scale = (this.frustum * 2) / window.innerHeight;
      const dx = (e.clientX - lastX) * scale;
      const dy = (e.clientY - lastY) * scale;
      lastX = e.clientX;
      lastY = e.clientY;
      // Screen-space drag mapped onto the ground plane for our fixed iso angle.
      const right = new THREE.Vector3(1, 0, -1).normalize();
      const up = new THREE.Vector3(-1, 0, -1).normalize();
      this.camTarget.addScaledVector(right, -dx).addScaledVector(up, dy);
      this.updateCamera();
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.frustum = THREE.MathUtils.clamp(this.frustum * (e.deltaY > 0 ? 1.12 : 0.9), 6, 26);
        this.resize();
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      const step = 1.2;
      const right = new THREE.Vector3(1, 0, -1).normalize();
      const up = new THREE.Vector3(-1, 0, -1).normalize();
      if (e.key === "ArrowLeft" || e.key === "a") this.camTarget.addScaledVector(right, -step);
      else if (e.key === "ArrowRight" || e.key === "d") this.camTarget.addScaledVector(right, step);
      else if (e.key === "ArrowUp" || e.key === "w") this.camTarget.addScaledVector(up, step);
      else if (e.key === "ArrowDown" || e.key === "s") this.camTarget.addScaledVector(up, -step);
      else return;
      this.updateCamera();
    });
  }

  // ------------------------------------------------------------------ terrain

  buildMap(game: Game) {
    this.terrainGroup.clear();
    this.tileMeshes.clear();
    this.tileDecor.clear();
    for (const t of game.tiles.values()) {
      const style = TERRAIN_STYLE[t.terrain];
      const geo = new THREE.CylinderGeometry(TILE_R, TILE_R, style.height, 6);
      // Material array: [side, top cap, bottom]. The cap gets a ground
      // texture when one exists; the side stays a darker cliff color.
      const sideColor = new THREE.Color(style.color).multiplyScalar(0.62).getHex();
      const side = new THREE.MeshLambertMaterial({ color: sideColor });
      const top = new THREE.MeshLambertMaterial({ color: style.color });
      const mesh = new THREE.Mesh(geo, [side, top, side]);
      const { x, z } = toWorld(t);
      // Default cylinder orientation puts a vertex at +z and flats toward all
      // six neighbor directions of this layout — exact tessellation, no extra
      // rotation. (Rotating by 30° points corners at neighbors and opens gaps.)
      mesh.position.set(x, style.height / 2, z);
      mesh.receiveShadow = true;
      mesh.castShadow = t.terrain === Terrain.Highlands;
      mesh.userData.tile = { q: t.q, r: t.r };
      mesh.userData.topBase = style.color;
      mesh.userData.sideBase = sideColor;
      mesh.userData.terrain = t.terrain;
      this.terrainGroup.add(mesh);
      this.tileMeshes.set(`${t.q},${t.r}`, mesh);
      this.tileTops.set(`${t.q},${t.r}`, style.height);

      this.decorateTile(t, x, z, style.height);

    }

    this.loadGroundTextures();
    this.buildClouds();
  }

  /**
   * Ground textures are optional: if public/textures/ground_<terrain>.png
   * exists (see scripts/generate-textures.mjs), it is draped over the tile
   * caps of that terrain; otherwise the flat palette color stays.
   */
  private loadGroundTextures() {
    const loader = new THREE.TextureLoader();
    for (const terrain of Object.values(Terrain)) {
      loader.load(
        `textures/ground_${terrain}.png`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          for (const mesh of this.tileMeshes.values()) {
            if (mesh.userData.terrain !== terrain) continue;
            const mats = mesh.material as THREE.MeshLambertMaterial[];
            mats[1].map = tex;
            mats[1].needsUpdate = true;
            // The texture carries the ground color now; tint from near-white
            // so fog dimming still works on top of it.
            mesh.userData.topBase = 0xffffff;
          }
          if (this.lastGame) this.sync(this.lastGame);
        },
        undefined,
        () => {}, // missing texture: keep the palette color, no console noise
      );
    }
  }

  /** Two drifting cloud planes floating above the map, density driven by the fog field. */
  private buildClouds() {
    this.cloudGroup.clear();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const m of this.tileMeshes.values()) {
      minX = Math.min(minX, m.position.x);
      maxX = Math.max(maxX, m.position.x);
      minZ = Math.min(minZ, m.position.z);
      maxZ = Math.max(maxZ, m.position.z);
    }
    const pad = 7;
    this.worldBounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };

    const res = SceneView.FIELD_RES;
    this.fogFieldData = new Uint8Array(res * res);
    this.fogField = new THREE.DataTexture(this.fogFieldData, res, res, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogField.minFilter = THREE.LinearFilter;
    this.fogField.magFilter = THREE.LinearFilter;
    this.fogField.needsUpdate = true;

    const w = this.worldBounds.maxX - this.worldBounds.minX;
    const h = this.worldBounds.maxZ - this.worldBounds.minZ;
    const cx = (this.worldBounds.minX + this.worldBounds.maxX) / 2;
    const cz = (this.worldBounds.minZ + this.worldBounds.maxZ) / 2;
    // Fixed iso camera forward, used to project cloud fragments down to the
    // ground so the fog stays aligned with the tiles it hides.
    const camDir = new THREE.Vector3(-1, -1.15, -1).normalize();

    const layer = (height: number, scale: number, speed: number, weight: number) => {
      const geo = new THREE.PlaneGeometry(w, h);
      geo.rotateX(-Math.PI / 2);
      const mat = makeCloudMaterial(this.fogUniforms.uTime, {
        field: this.fogField!,
        min: new THREE.Vector2(this.worldBounds.minX, this.worldBounds.minZ),
        size: new THREE.Vector2(w, h),
        camDir,
        scale,
        speed,
        weight,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, height, cz);
      this.cloudGroup.add(mesh);
    };
    layer(1.7, 0.34, 2.6, 1.0); // main deck
    layer(2.35, 0.55, 4.2, 0.45); // high wisps, faster drift
  }

  private addDecor(t: Tile, mesh: THREE.Mesh) {
    mesh.userData.baseColor = ((mesh.material as THREE.MeshLambertMaterial).color as THREE.Color).getHex();
    this.terrainGroup.add(mesh);
    const k = `${t.q},${t.r}`;
    const list = this.tileDecor.get(k) ?? [];
    list.push(mesh);
    this.tileDecor.set(k, list);
  }

  private decorateTile(t: Tile, x: number, z: number, top: number) {
    const rnd = mulberry(t.q * 73856093 ^ t.r * 19349663);
    if (t.terrain === Terrain.Ruins) {
      // Broken pre-Collapse stubs.
      for (let i = 0; i < 3; i++) {
        const h = 0.25 + rnd() * 0.55;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.16 + rnd() * 0.14, h, 0.16 + rnd() * 0.14),
          new THREE.MeshLambertMaterial({ color: 0x4a505c }),
        );
        box.position.set(x + (rnd() - 0.5) * 0.9, top + h / 2, z + (rnd() - 0.5) * 0.9);
        box.rotation.y = rnd() * Math.PI;
        box.castShadow = true;
        this.addDecor(t, box);
      }
    } else if (t.terrain === Terrain.Slag) {
      const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(TILE_R * 0.82, TILE_R * 0.82, 0.02, 6),
        new THREE.MeshBasicMaterial({ color: 0xff5a1f }),
      );
      glow.position.set(x, top + 0.012, z);
      this.addDecor(t, glow);
      this.animated.push({ obj: glow, base: top + 0.012, phase: rnd() * 6, amp: 0 });
    } else if (t.terrain === Terrain.Geovent) {
      const vent = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0x54e0e8 }),
      );
      vent.position.set(x, top + 0.25, z);
      this.addDecor(t, vent);
      this.animated.push({ obj: vent, base: top + 0.25, phase: rnd() * 6, amp: 0.08 });
    } else if (t.terrain === Terrain.Highlands && rnd() < 0.6) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18 + rnd() * 0.12),
        new THREE.MeshLambertMaterial({ color: 0x6a5a45 }),
      );
      rock.position.set(x + (rnd() - 0.5) * 0.8, top + 0.12, z + (rnd() - 0.5) * 0.8);
      rock.castShadow = true;
      this.addDecor(t, rock);
    }
  }

  // ------------------------------------------------------------------ dynamic

  private lastGame: Game | null = null;

  /** Rebuild buildings + units from state. Cheap at this scale, always correct. */
  sync(game: Game) {
    this.lastGame = game;
    game.recomputeVision();
    this.dynamicGroup.clear();
    this.animated = this.animated.filter((a) => a.obj.parent === this.terrainGroup || a.obj.parent === this.scene);

    const EXPLORED_DIM = 0.42;
    const UNEXPLORED_DIM = 0.1; // dark silhouette glimpsed through thin fog edges
    for (const t of game.tiles.values()) {
      const k = `${t.q},${t.r}`;
      const mesh = this.tileMeshes.get(k);
      if (!mesh) continue;
      // Looted ruins go dim permanently, on top of fog.
      if (t.terrain === Terrain.Ruins) {
        const textured = !!(mesh.material as THREE.MeshLambertMaterial[])[1].map;
        mesh.userData.topBase = t.looted ? (textured ? 0x6a6a6a : 0x3f434c) : (textured ? 0xffffff : 0x5e6470);
      }

      const explored = game.isExplored(t.q, t.r);
      const seen = game.isVisible(t.q, t.r);
      const factor = seen ? 1 : explored ? EXPLORED_DIM : UNEXPLORED_DIM;
      const mats = mesh.material as THREE.MeshLambertMaterial[];
      mats[1].color.set(mesh.userData.topBase as number).multiplyScalar(factor);
      mats[0].color.set(mesh.userData.sideBase as number).multiplyScalar(factor);
      for (const d of this.tileDecor.get(k) ?? []) {
        d.visible = explored;
        (d.material as THREE.MeshLambertMaterial).color.set(d.userData.baseColor as number).multiplyScalar(factor);
      }
    }
    this.updateFogField(game);

    for (const b of game.buildings) {
      // Buildings persist on explored ground as dim silhouettes; unexplored stays secret.
      if (!game.isExplored(b.q, b.r)) continue;
      const seen = game.isVisible(b.q, b.r);
      const g = this.buildingMesh(b, game.tierOf(b.faction));
      if (!seen) dimGroup(g, EXPLORED_DIM);
      this.dynamicGroup.add(g);
    }
    for (const u of game.units) {
      // Units only exist where you can currently see. Yours always can.
      if (!game.isVisible(u.q, u.r)) continue;
      this.dynamicGroup.add(this.unitMesh(u));
    }
  }

  /**
   * Rasterize fog density into the field texture: 0 where visible, light haze
   * on remembered ground, then a ramp from translucent at the explored
   * frontier to near-opaque deep in the unknown.
   */
  private updateFogField(game: Game) {
    if (!this.fogField || !this.fogFieldData) return;

    // Frontier distance via multi-source BFS from the explored border. The
    // BFS deliberately flows past the map boundary as well, so fog fades in
    // just as gradually off-map — otherwise the edge of the world would slam
    // to full density and bleed onto visible border tiles.
    const hexNeighbors = (q: number, r: number) => [
      { q: q + 1, r }, { q: q + 1, r: r - 1 }, { q, r: r - 1 },
      { q: q - 1, r }, { q: q - 1, r: r + 1 }, { q, r: r + 1 },
    ];
    const depth = new Map<string, number>();
    let frontier: { q: number; r: number }[] = [];
    for (const k of game.explored) {
      const [q, r] = k.split(",").map(Number);
      for (const n of hexNeighbors(q, r)) {
        const nk = `${n.q},${n.r}`;
        if (game.explored.has(nk) || depth.has(nk)) continue;
        depth.set(nk, 1);
        frontier.push(n);
      }
    }
    let d = 1;
    while (frontier.length && d < 6) {
      const next: { q: number; r: number }[] = [];
      for (const c of frontier) {
        for (const n of hexNeighbors(c.q, c.r)) {
          const nk = `${n.q},${n.r}`;
          if (game.explored.has(nk) || depth.has(nk)) continue;
          depth.set(nk, d + 1);
          next.push(n);
        }
      }
      frontier = next;
      d++;
    }

    const density = (q: number, r: number): number => {
      const k = `${q},${r}`;
      if (game.visible.has(k)) return 0;
      if (game.explored.has(k)) return 0.22; // remembered ground: light haze
      const dd = depth.get(k) ?? 6;
      // Long falloff: thickens over ~5 tiles from the frontier, on and off map.
      return Math.min(0.34 + dd * 0.13, 0.95); // 1→0.47, 2→0.60, 3→0.73, 4→0.86, 5+→0.95
    };

    const res = SceneView.FIELD_RES;
    const { minX, maxX, minZ, maxZ } = this.worldBounds;
    const sqrt3 = Math.sqrt(3);
    for (let iy = 0; iy < res; iy++) {
      const z = minZ + ((iy + 0.5) / res) * (maxZ - minZ);
      for (let ix = 0; ix < res; ix++) {
        const x = minX + ((ix + 0.5) / res) * (maxX - minX);
        // World -> nearest hex (axial round).
        const fq = (sqrt3 / 3) * x - z / 3;
        const fr = (2 / 3) * z;
        const fs = -fq - fr;
        let q = Math.round(fq), r = Math.round(fr);
        const s = Math.round(fs);
        const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
        if (dq > dr && dq > ds) q = -r - s;
        else if (dr > ds) r = -q - s;
        this.fogFieldData[iy * res + ix] = Math.round(density(q, r) * 255);
      }
    }
    this.fogField.needsUpdate = true;
  }

  private groundY(q: number, r: number): number {
    return this.tileTops.get(`${q},${r}`) ?? 0.3;
  }

  /**
   * Faction citadels: each techno-king's seat is themed after their
   * real-world(ish) empire, and gains a new architectural flourish with
   * every era (tier 0-4). Stages are cumulative.
   */
  private citadelMesh(g: THREE.Group, faction: number, tier: number) {
    const fc = FACTIONS[faction].color;
    const accent = new THREE.MeshLambertMaterial({ color: fc });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3c3630 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x8a9098 });
    const glow = (color: number) => new THREE.MeshBasicMaterial({ color });

    const add = (mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    const float = (obj: THREE.Object3D, baseY: number, amp: number) => {
      this.animated.push({ obj, base: baseY, phase: faction * 2.1, amp });
    };

    switch (faction) {
      // ---- Dominion of X: launch pad, rockets, and eventually a giant X ----
      case 0: {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.22, 6), dark), 0, 0.11, 0);
        // Angular bunker, aggressively cybertruck.
        const bunker = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.34, 0.42, 4), metal), -0.32, 0.42, -0.2);
        bunker.rotation.y = 0.5;
        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), accent), -0.32, 0.24, -0.2);
        if (tier >= 1) {
          const h = tier >= 2 ? 1.25 : 0.7;
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, h, 10), metal), 0.18, 0.22 + h / 2, 0.12);
          add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 10), accent), 0.18, 0.22 + h + 0.15, 0.12);
        }
        if (tier >= 2) {
          // Launch tower with fins on the rocket.
          add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.5, 0.09), dark), 0.52, 0.95, 0.12);
          for (let i = 0; i < 3; i++) {
            const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.03), accent), 0.18, 0.4, 0.12);
            fin.rotation.y = (i / 3) * Math.PI * 2;
            fin.translateX(0.14);
          }
        }
        if (tier >= 3) {
          // Chopstick catch-arms and an engine glow ring.
          add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06), metal), 0.36, 1.35, 0.06);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06), metal), 0.36, 1.35, 0.2);
          const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 16), glow(0xff7a2f)), 0.18, 0.28, 0.12);
          ring.rotation.x = Math.PI / 2;
        }
        if (tier >= 4) {
          // The letter fetish, fully realized: a giant floating X.
          const xg = new THREE.Group();
          const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.08), glow(0xff5540));
          bar1.rotation.z = Math.PI / 4;
          const bar2 = bar1.clone();
          bar2.rotation.z = -Math.PI / 4;
          xg.add(bar1, bar2);
          xg.position.set(0.18, 2.25, 0.12);
          g.add(xg);
          float(xg, 2.25, 0.06);
        }
        break;
      }

      // ---- Zuckerborg Collective: glass campus, servers, the orb ----
      case 1: {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.8), new THREE.MeshLambertMaterial({ color: 0x5a7a9a })), 0, 0.12, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.05, 0.84), accent), 0, 0.27, 0);
        if (tier >= 1) {
          const tower = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.42), dark), -0.2, 0.72, -0.1);
          void tower;
          for (let i = 0; i < 3; i++) {
            add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), glow(0x4fa8ff)), -0.2, 0.5 + i * 0.28, -0.1);
          }
        }
        if (tier >= 2) {
          // The infinity emblem, in chrome.
          const inf = new THREE.Group();
          const l1 = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 18), metal);
          const l2 = l1.clone();
          l1.position.x = -0.12;
          l2.position.x = 0.12;
          l1.rotation.y = 0.5;
          l2.rotation.y = -0.5;
          inf.add(l1, l2);
          inf.position.set(-0.2, 1.45, -0.1);
          g.add(inf);
        }
        if (tier >= 3) {
          // A monumental VR visor on the campus roof.
          add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshLambertMaterial({ color: 0xd8d8dc })), 0.32, 0.42, 0.18);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.06), glow(0x1a2a3a)), 0.32, 0.42, 0.34);
        }
        if (tier >= 4) {
          // The orb sees your engagement metrics.
          const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), glow(0x4fa8ff));
          orb.position.set(-0.2, 2.0, -0.1);
          g.add(orb);
          float(orb, 2.0, 0.08);
          const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.02, 6, 20), accent), -0.2, 2.0, -0.1);
          ring.rotation.x = Math.PI / 2.4;
        }
        break;
      }

      // ---- Prime Caliphate: the warehouse-cathedral ----
      case 2: {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.4, 0.75), new THREE.MeshLambertMaterial({ color: 0x9a8f80 })), 0, 0.2, 0);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.19, 0.05, 0.79), dark), 0, 0.42, 0);
        if (tier >= 1) {
          add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.32, 0.6), new THREE.MeshLambertMaterial({ color: 0x8a7f70 })), -0.05, 0.6, 0);
          // The smile. It is not optional.
          const smile = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 8, 20, Math.PI * 0.75), glow(0xffb13c)), 0, 0.35, 0.39);
          smile.rotation.z = Math.PI + 0.4;
        }
        if (tier >= 2) {
          for (let i = 0; i < 3; i++) {
            add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: [0xb06a3a, 0x707a88, 0x8a5a2a][i] })), 0.32 - i * 0.24, 0.83, 0.12);
          }
          add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), dark), 0.44, 1.1, -0.2);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), accent), 0.44, 1.5, -0.2);
        }
        if (tier >= 3) {
          // A rocket of remarkably specific proportions.
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.65, 12), new THREE.MeshLambertMaterial({ color: 0xe8e4dc })), -0.4, 1.1, -0.15);
          add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshLambertMaterial({ color: 0xd8d4cc })), -0.4, 1.45, -0.15);
        }
        if (tier >= 4) {
          // Delivery drones, circling forever.
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            const drone = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), accent);
            const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 10), dark);
            rotor.position.y = 0.05;
            drone.add(body, rotor);
            drone.position.set(Math.cos(a) * 0.55, 1.85, Math.sin(a) * 0.55);
            g.add(drone);
            float(drone, 1.85, 0.07 + i * 0.02);
          }
        }
        break;
      }

      // ---- ClosedAI Papacy: the temple of the weights ----
      default: {
        const ivory = new THREE.MeshLambertMaterial({ color: 0xe3ddd0 });
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.18, 6), ivory), 0, 0.09, 0);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.16, 6), ivory), 0, 0.26, 0);
        if (tier >= 1) {
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.2, 1.05, 4), ivory), 0, 0.86, 0);
        }
        if (tier >= 2) {
          // The hexagonal halo. Vaguely open, legally closed.
          const halo = add(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 6), accent), 0, 1.75, 0);
          halo.rotation.x = Math.PI / 2;
          float(halo, 1.75, 0.05);
        }
        if (tier >= 3) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), new THREE.MeshLambertMaterial({ color: 0xf5f2ea }));
          eye.position.set(0, 1.75, 0);
          g.add(eye);
          const iris = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), glow(0x45e8c8));
          iris.position.set(0, 1.75, 0.1);
          g.add(iris);
          float(eye, 1.75, 0.05);
          float(iris, 1.75, 0.05);
        }
        if (tier >= 4) {
          const halo2 = add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 6), glow(0x45e8c8)), 0, 2.1, 0);
          halo2.rotation.x = Math.PI / 2.6;
          const beam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.09, 1.6, 8),
            new THREE.MeshBasicMaterial({ color: 0xcafef0, transparent: true, opacity: 0.35, depthWrite: false }),
          );
          beam.position.set(0, 2.6, 0);
          g.add(beam);
        }
        break;
      }
    }

    // Every court needs a beacon in its house color.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glow(fc));
    beacon.position.set(0, 0.55 + tier * 0.12, 0.42);
    g.add(beacon);
  }

  private buildingMesh(b: Building, tier = 0): THREE.Group {
    const g = new THREE.Group();
    const fc = FACTIONS[b.faction].color;
    const accent = new THREE.MeshLambertMaterial({ color: fc });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3c3630 });
    const metal = new THREE.MeshLambertMaterial({ color: 0x777d85 });

    const add = (mesh: THREE.Mesh, y: number) => {
      mesh.position.y += y;
      mesh.castShadow = true;
      g.add(mesh);
    };

    switch (b.kind) {
      case "citadel": {
        this.citadelMesh(g, b.faction, tier);
        break;
      }
      case "solar": {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), dark), 0.04);
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.04, 0.6),
          new THREE.MeshLambertMaterial({ color: 0x2b4a78 }),
        );
        panel.rotation.z = -0.5;
        add(panel, 0.42);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35), accent);
        add(post, 0.2);
        break;
      }
      case "reactor": {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.35, 12), dark), 0.17);
        add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 8, 18), metal), 0.62);
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0x54e0e8 }),
        );
        add(core, 0.62);
        this.animated.push({ obj: core, base: 0, phase: Math.random() * 6, amp: 0 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 18), accent);
        ring.rotation.x = Math.PI / 2;
        add(ring, 0.35);
        break;
      }
      case "servers": {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.7), dark), 0.05);
        for (let i = 0; i < 3; i++) {
          const rack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.5), metal);
          add(rack, 0.38);
          rack.position.x = -0.28 + i * 0.28;
          const led = new THREE.Mesh(
            new THREE.BoxGeometry(0.23, 0.04, 0.4),
            new THREE.MeshBasicMaterial({ color: 0x6fff7a }),
          );
          led.position.set(-0.28 + i * 0.28, 0.52, 0.06);
          g.add(led);
        }
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.75), accent);
        add(trim, 0.12);
        break;
      }
      case "mechworks": {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.8), dark), 0.25);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.85), accent);
        add(roof, 0.55);
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5), metal);
        stack.position.x = 0.32;
        add(stack, 0.8);
        break;
      }
      case "turret": {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8), dark), 0.15);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), accent), 0.42);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), metal);
        barrel.rotation.z = Math.PI / 2.6;
        barrel.position.x = 0.2;
        add(barrel, 0.52);
        break;
      }
    }

    const { x, z } = toWorld(b);
    g.position.set(x, this.groundY(b.q, b.r), z);
    g.userData.tile = { q: b.q, r: b.r };
    return g;
  }

  private unitMesh(u: Unit): THREE.Group {
    const g = new THREE.Group();
    const fc = FACTIONS[u.faction].color;
    const accent = new THREE.MeshLambertMaterial({ color: fc });
    const metal = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    const darkMetal = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });

    const add = (mesh: THREE.Mesh, y: number): THREE.Mesh => {
      mesh.position.y += y;
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };

    let bobAmp = 0;
    switch (u.kind) {
      case "drone": {
        add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), accent), 0.55);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12), darkMetal);
        add(rotor, 0.7);
        bobAmp = 0.07;
        break;
      }
      case "sentinel": {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.18), metal), 0.35);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.16), accent), 0.64);
        const eye = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.03, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xff4040 }),
        );
        eye.position.set(0, 0.64, 0.09);
        g.add(eye);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.14), darkMetal), 0.12);
        break;
      }
      case "hovertank": {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), accent);
        add(hull, 0.3);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), darkMetal), 0.44);
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42), metal);
        gun.rotation.z = Math.PI / 2;
        gun.position.x = 0.25;
        add(gun, 0.46);
        bobAmp = 0.05;
        break;
      }
      case "warmech": {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), darkMetal), 0.2).position.x = -0.14;
        add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), darkMetal), 0.2).position.x = 0.14;
        add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.36), accent), 0.6);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), metal), 0.88);
        const eye = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.04, 0.02),
          new THREE.MeshBasicMaterial({ color: 0xff4040 }),
        );
        eye.position.set(0, 0.88, 0.11);
        g.add(eye);
        const cannonL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), metal);
        cannonL.position.set(-0.32, 0.72, 0.1);
        cannonL.castShadow = true;
        g.add(cannonL);
        break;
      }
    }

    // HP bar
    const maxHp = UNITS[u.kind].hp;
    const frac = Math.max(0, u.hp / maxHp);
    const barBg = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x201810 }),
    );
    barBg.position.y = 1.05;
    g.add(barBg);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * frac, 0.055, 0.055),
      new THREE.MeshBasicMaterial({ color: frac > 0.5 ? 0x9be564 : frac > 0.25 ? 0xffd23f : 0xff6b57 }),
    );
    bar.position.set(-0.25 + 0.25 * frac, 1.05, 0);
    g.add(bar);

    // Spent units dim slightly so you can see who still has orders left.
    if (u.movesLeft <= 0) {
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (m && "color" in m) {
          m.transparent = true;
          m.opacity = 0.55;
        }
      });
    }

    const { x, z } = toWorld(u);
    const y = this.groundY(u.q, u.r);
    g.position.set(x, y, z);
    g.userData.tile = { q: u.q, r: u.r };
    if (bobAmp > 0) this.animated.push({ obj: g, base: y, phase: u.id, amp: bobAmp });
    return g;
  }

  // ---------------------------------------------------------------- overlays

  setHighlights(opts: { move?: { q: number; r: number }[]; attack?: { q: number; r: number }[]; build?: { q: number; r: number }[] }) {
    this.highlightGroup.clear();
    const mk = (cells: { q: number; r: number }[], color: number, opacity: number) => {
      for (const c of cells) {
        const geo = new THREE.CylinderGeometry(TILE_R * 0.9, TILE_R * 0.9, 0.04, 6);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
        const m = new THREE.Mesh(geo, mat);
        const { x, z } = toWorld(c);
        m.position.set(x, this.groundY(c.q, c.r) + 0.03, z);
        m.userData.tile = { q: c.q, r: c.r };
        this.highlightGroup.add(m);
      }
    };
    if (opts.move) mk(opts.move, 0xffd23f, 0.33);
    if (opts.attack) mk(opts.attack, 0xff4030, 0.45);
    if (opts.build) mk(opts.build, 0x6fff7a, 0.3);
  }

  setSelection(pos: { q: number; r: number } | null) {
    if (!pos) {
      this.selectionRing.visible = false;
      return;
    }
    const { x, z } = toWorld(pos);
    this.selectionRing.position.set(x, this.groundY(pos.q, pos.r) + 0.06, z);
    this.selectionRing.visible = true;
  }

  // ------------------------------------------------------------------ picking

  pickTile(clientX: number, clientY: number): { q: number; r: number } | null {
    this.pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.terrainGroup.children, ...this.dynamicGroup.children],
      true,
    );
    for (const h of hits) {
      if (!h.object.visible) continue; // raycaster doesn't skip hidden meshes itself
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.tile) return o.userData.tile;
        o = o.parent;
      }
    }
    return null;
  }

  /** World tile -> screen pixel coords (used by automated playtests + debugging). */
  toScreen(q: number, r: number): { x: number; y: number } {
    const { x, z } = toWorld({ q, r });
    const v = new THREE.Vector3(x, this.groundY(q, r), z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * window.innerWidth,
      y: ((-v.y + 1) / 2) * window.innerHeight,
    };
  }

  // -------------------------------------------------------------------- loop

  private frame() {
    const t = (performance.now() - this.startTime) / 1000;
    this.fogUniforms.uTime.value = t;
    for (const a of this.animated) {
      if (a.amp > 0) a.obj.position.y = a.base + Math.sin(t * 2 + a.phase) * a.amp;
      const mat = (a.obj as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat && a.amp === 0) {
        // Emissive pulse for glowy bits.
        const s = 0.75 + 0.25 * Math.sin(t * 3 + a.phase);
        mat.opacity = s;
        mat.transparent = true;
      }
    }
    this.selectionRing.rotation.y = t * 1.5;
    const s = 1 + 0.06 * Math.sin(t * 4);
    this.selectionRing.scale.set(s, 1, s);
    this.renderer.render(this.scene, this.camera);
  }
}

/**
 * A drifting cloud deck. Density comes from the fog field texture (0 = clear,
 * 1 = solid) sampled at the point on the ground this fragment hides — the
 * fragment is projected down along the fixed iso camera direction, so the
 * elevated cloud stays aligned with the tiles beneath it. FBM noise shreds
 * the edges and keeps the deck rolling.
 */
function makeCloudMaterial(
  uTime: { value: number },
  opts: {
    field: THREE.DataTexture;
    min: THREE.Vector2;
    size: THREE.Vector2;
    camDir: THREE.Vector3;
    scale: number;
    speed: number;
    weight: number;
  },
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uField: { value: opts.field },
      uMin: { value: opts.min },
      uSize: { value: opts.size },
      uCamDir: { value: opts.camDir },
      uScale: { value: opts.scale },
      uSpeed: { value: opts.speed },
      uWeight: { value: opts.weight },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uField;
      uniform vec2 uMin;
      uniform vec2 uSize;
      uniform vec3 uCamDir;
      uniform float uScale;
      uniform float uSpeed;
      uniform float uWeight;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        // Project this cloud fragment down to the ground along the camera ray
        // so density lines up with the tiles it is supposed to hide.
        vec2 groundXZ = vWorld.xz + uCamDir.xz * (vWorld.y / -uCamDir.y);
        vec2 uv = (groundXZ - uMin) / uSize;
        float base = texture2D(uField, uv).r;

        float t = uTime * uSpeed;
        vec2 p = vWorld.xz * uScale;
        // Domain warp: the noise field itself is pushed around by slower
        // noise, which is what makes clouds billow instead of just scroll.
        vec2 warp = vec2(fbm(p * 0.6 + t * vec2(0.05, 0.03)),
                         fbm(p * 0.6 - t * vec2(0.04, 0.06) + 31.0));
        p += (warp - 0.5) * 1.7;
        float n1 = fbm(p + t * vec2(0.13, 0.05));
        float n2 = fbm(p * 1.9 - t * vec2(0.07, 0.12) + 17.0);
        float m = n1 * 0.6 + n2 * 0.4;

        // Noise erodes the fog where it is thin (ragged translucent edges) and
        // still rolls visibly through the deep cover.
        float wisp = mix(0.15 + 1.25 * m, 0.62 + 0.62 * m, smoothstep(0.5, 0.9, base));
        float alpha = clamp(base * wisp, 0.0, 0.97) * uWeight;

        // Dissolve before the cloud plane's own rectangular border shows.
        float edgeFade = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x)
                       * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.88, uv.y);
        alpha *= edgeFade;

        // Bright mist at the thin edges, darkening as the deck thickens, with
        // strong per-billow shading so the cloud structure reads everywhere.
        vec3 edge = vec3(0.56, 0.58, 0.66);
        vec3 deep = vec3(0.10, 0.105, 0.15);
        vec3 col = mix(edge, deep, smoothstep(0.2, 0.9, base));
        col *= 0.65 + 0.75 * m;

        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

function dimGroup(g: THREE.Object3D, factor: number) {
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
    if (m && "color" in m) m.color.multiplyScalar(factor);
  });
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
