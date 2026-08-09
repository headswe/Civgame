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
  private shroudGroup = new THREE.Group();
  private mistGroup = new THREE.Group();
  private tileMeshes = new Map<string, THREE.Mesh>();
  private shroudMeshes = new Map<string, THREE.Mesh>();
  private mistMeshes = new Map<string, THREE.Mesh>();
  private fogUniforms = { uTime: { value: 0 } };
  private shroudMat: THREE.ShaderMaterial;
  private mistMat: THREE.ShaderMaterial;
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

    this.scene.add(this.terrainGroup, this.dynamicGroup, this.highlightGroup, this.shroudGroup, this.mistGroup);

    this.shroudMat = makeFogMaterial(this.fogUniforms, 1.0);
    this.mistMat = makeFogMaterial(this.fogUniforms, 0.55);

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
      const mat = new THREE.MeshLambertMaterial({ color: style.color });
      const mesh = new THREE.Mesh(geo, mat);
      const { x, z } = toWorld(t);
      // Default cylinder orientation puts a vertex at +z and flats toward all
      // six neighbor directions of this layout — exact tessellation, no extra
      // rotation. (Rotating by 30° points corners at neighbors and opens gaps.)
      mesh.position.set(x, style.height / 2, z);
      mesh.receiveShadow = true;
      mesh.castShadow = t.terrain === Terrain.Highlands;
      mesh.userData.tile = { q: t.q, r: t.r };
      mesh.userData.baseColor = style.color;
      this.terrainGroup.add(mesh);
      this.tileMeshes.set(`${t.q},${t.r}`, mesh);
      this.tileTops.set(`${t.q},${t.r}`, style.height);

      this.decorateTile(t, x, z, style.height);

      // Shroud: a slab of drifting mist covering unexplored tiles, so the fog
      // reads as "unknown ground" and only past the map edge is true void.
      // Uniform-ish height so terrain relief doesn't leak through.
      const rnd = mulberry((t.q * 31 + t.r * 17 + 7) >>> 0);
      const sh = 0.34 + rnd() * 0.1;
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R, TILE_R, sh, 6), this.shroudMat);
      shroud.position.set(x, sh / 2, z);
      shroud.userData.tile = { q: t.q, r: t.r };
      this.shroudGroup.add(shroud);
      this.shroudMeshes.set(`${t.q},${t.r}`, shroud);

      // Mist: a thin translucent wisp layer laid over explored-but-fogged
      // tiles, so remembered ground looks half-swallowed by the same fog.
      const mist = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R, TILE_R, 0.05, 6), this.mistMat);
      mist.position.set(x, style.height + 0.09, z);
      this.mistGroup.add(mist);
      this.mistMeshes.set(`${t.q},${t.r}`, mist);
    }
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

  /** Rebuild buildings + units from state. Cheap at this scale, always correct. */
  sync(game: Game) {
    game.recomputeVision();
    this.dynamicGroup.clear();
    this.animated = this.animated.filter((a) => a.obj.parent === this.terrainGroup || a.obj.parent === this.scene);

    const EXPLORED_DIM = 0.38;
    for (const t of game.tiles.values()) {
      const k = `${t.q},${t.r}`;
      const mesh = this.tileMeshes.get(k);
      if (!mesh) continue;
      // Looted ruins go dim permanently, on top of fog.
      if (t.terrain === Terrain.Ruins) mesh.userData.baseColor = t.looted ? 0x3f434c : 0x5e6470;

      const explored = game.isExplored(t.q, t.r);
      const seen = game.isVisible(t.q, t.r);
      const factor = seen ? 1 : EXPLORED_DIM;
      mesh.visible = explored;
      const shroud = this.shroudMeshes.get(k);
      if (shroud) shroud.visible = !explored;
      const mist = this.mistMeshes.get(k);
      if (mist) mist.visible = explored && !seen;
      (mesh.material as THREE.MeshLambertMaterial).color.set(mesh.userData.baseColor as number).multiplyScalar(factor);
      for (const d of this.tileDecor.get(k) ?? []) {
        d.visible = explored;
        (d.material as THREE.MeshLambertMaterial).color.set(d.userData.baseColor as number).multiplyScalar(factor);
      }
    }

    for (const b of game.buildings) {
      // Buildings persist on explored ground as dim silhouettes; unexplored stays secret.
      if (!game.isExplored(b.q, b.r)) continue;
      const seen = game.isVisible(b.q, b.r);
      const g = this.buildingMesh(b);
      if (!seen) dimGroup(g, EXPLORED_DIM);
      this.dynamicGroup.add(g);
    }
    for (const u of game.units) {
      // Units only exist where you can currently see. Yours always can.
      if (!game.isVisible(u.q, u.r)) continue;
      this.dynamicGroup.add(this.unitMesh(u));
    }
  }

  private groundY(q: number, r: number): number {
    return this.tileTops.get(`${q},${r}`) ?? 0.3;
  }

  private buildingMesh(b: Building): THREE.Group {
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
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.3, 6), dark), 0.15);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 0.9, 6), metal), 0.75);
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.16, 6), accent), 1.3);
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          new THREE.MeshBasicMaterial({ color: fc }),
        );
        add(beacon, 1.62);
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), metal);
        add(spire, 1.5);
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
      [...this.terrainGroup.children, ...this.dynamicGroup.children, ...this.shroudGroup.children],
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
 * Animated fog: two layers of FBM value noise drifting in different
 * directions over world-space XZ, so the mist flows continuously across
 * tile boundaries. `opacity` 1 = opaque shroud, <1 = translucent wisps.
 */
function makeFogMaterial(uniforms: { uTime: { value: number } }, opacity: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    defines: opacity < 1 ? { WISPY: 1 } : {},
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
        vec2 p = vWorld.xz * 0.32;
        float n1 = fbm(p + uTime * vec2(0.055, 0.02));
        float n2 = fbm(p * 1.8 - uTime * vec2(0.028, 0.05) + 17.0);
        float m = n1 * 0.62 + n2 * 0.38;
        vec3 deep = vec3(0.085, 0.09, 0.125);
        vec3 mist = vec3(0.38, 0.40, 0.48);
        vec3 col = mix(deep, mist, smoothstep(0.22, 0.88, m));
        float alpha = OPACITY;
        #ifdef WISPY
          alpha *= 0.45 + 0.55 * smoothstep(0.3, 0.9, m);
        #endif
        gl_FragColor = vec4(col, alpha);
      }
    `.replace("OPACITY", opacity.toFixed(2)),
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
  });
  return mat;
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
