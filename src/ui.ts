import { Terrain, type Building, type BuildingKind, type Tile, type Unit } from "./types";
import { BUILDINGS, FACTIONS, TIERS, UNITS } from "./content";
import { key } from "./hex";
import type { Game, LogKind } from "./game";
import { runAiTurn } from "./ai";
import type { SceneView } from "./scene";

type Selection =
  | { type: "unit"; unit: Unit }
  | { type: "building"; building: Building }
  | { type: "tile"; tile: Tile }
  | null;

const TERRAIN_LABEL: Record<Terrain, string> = {
  [Terrain.Wastes]: "Wastes — open ground, buildable",
  [Terrain.Ashdunes]: "Ashdunes — gray drifts of the old sky",
  [Terrain.Highlands]: "Highlands — +2 defense",
  [Terrain.Ruins]: "Pre-Collapse Ruins — +1 defense, scavengeable",
  [Terrain.Slag]: "Slag Flow — impassable melted city",
  [Terrain.Geovent]: "Geothermal Vent — reactors built here get +5⚡",
};

export class GameUI {
  private selection: Selection = null;
  private buildMode: BuildingKind | null = null;
  private busy = false;

  private topbar = document.getElementById("topbar")!;
  private sidepanel = document.getElementById("sidepanel")!;
  private logEl = document.getElementById("log")!;
  private endturnEl = document.getElementById("endturn")!;
  private tooltipEl = document.getElementById("tooltip")!;

  constructor(
    private game: Game,
    private view: SceneView,
    private onGameOver: () => void,
  ) {
    game.log = (msg, kind) => this.pushLog(msg, kind);

    this.topbar.classList.remove("hidden");
    this.sidepanel.classList.remove("hidden");
    this.endturnEl.classList.remove("hidden");

    const canvas = document.getElementById("scene")!;
    canvas.addEventListener("click", (e) => this.onClick(e as MouseEvent));
    canvas.addEventListener("mousemove", (e) => this.onHover(e as MouseEvent));
    canvas.addEventListener("mouseleave", () => this.tooltipEl.classList.add("hidden"));
    this.endturnEl.onclick = () => this.endTurn();
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.endTurn();
      if (e.key === "Escape") {
        this.buildMode = null;
        this.select(null);
      }
    });

    // Player's first turn starts now.
    this.game.refreshUnits(this.game.playerFaction);
    this.refresh();
  }

  // ------------------------------------------------------------------- input

  private onClick(e: MouseEvent) {
    if (this.busy || this.game.result) return;
    const pos = this.view.pickTile(e.clientX, e.clientY);
    if (!pos) {
      this.select(null);
      return;
    }
    const tile = this.game.tile(pos.q, pos.r);
    if (!tile) return;
    // The fog keeps its secrets.
    if (!this.game.isExplored(pos.q, pos.r)) {
      this.select(null);
      return;
    }
    const p = this.game.playerFaction;

    // Build placement mode.
    if (this.buildMode) {
      if (this.game.tryBuild(p, this.buildMode, pos.q, pos.r)) {
        this.buildMode = null;
        this.select(null);
        return;
      }
      this.buildMode = null;
      this.refresh();
      return;
    }

    // Move or attack with the selected unit.
    if (this.selection?.type === "unit" && this.selection.unit.faction === p) {
      const u = this.selection.unit;
      const isEnemy =
        (tile.unit && tile.unit.faction !== p) || (tile.building && tile.building.faction !== p);
      if (isEnemy && this.game.attackTargets(u).some((t) => t.q === pos.q && t.r === pos.r)) {
        this.game.attack(u, pos.q, pos.r);
        this.game.checkConquest();
        if (this.game.result) return this.finish();
        this.select(this.game.units.includes(u) ? { type: "unit", unit: u } : null);
        return;
      }
      if (this.game.moveRange(u).has(key(pos.q, pos.r))) {
        this.game.moveUnit(u, pos.q, pos.r);
        this.select({ type: "unit", unit: u });
        return;
      }
    }

    // Otherwise select what's on the tile: unit first, then building, then dirt.
    // Clicking the same tile again cycles unit -> building underneath it.
    // Units in the fog don't exist as far as the cursor is concerned.
    const unitHere = this.game.isVisible(pos.q, pos.r) ? tile.unit : null;
    if (unitHere && this.selection?.type === "unit" && this.selection.unit === unitHere && tile.building) {
      this.select({ type: "building", building: tile.building });
    } else if (unitHere) this.select({ type: "unit", unit: unitHere });
    else if (tile.building) this.select({ type: "building", building: tile.building });
    else this.select({ type: "tile", tile });
  }

  private onHover(e: MouseEvent) {
    const pos = this.view.pickTile(e.clientX, e.clientY);
    if (!pos) {
      this.tooltipEl.classList.add("hidden");
      return;
    }
    const t = this.game.tile(pos.q, pos.r);
    if (!t) {
      this.tooltipEl.classList.add("hidden");
      return;
    }
    if (!this.game.isExplored(pos.q, pos.r)) {
      this.tooltipEl.innerHTML = `<div class="t-title">Terra Incognita</div>
        <div class="t-dim">Unscouted wasteland — send a drone.</div>`;
      this.tooltipEl.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 260)}px`;
      this.tooltipEl.style.top = `${e.clientY + 14}px`;
      this.tooltipEl.classList.remove("hidden");
      return;
    }
    const seen = this.game.isVisible(pos.q, pos.r);
    const bits: string[] = [];
    if (t.unit && seen) {
      const d = UNITS[t.unit.kind];
      bits.push(
        `<div class="t-title" style="color:${FACTIONS[t.unit.faction].cssColor}">${d.name} — ${FACTIONS[t.unit.faction].name}</div>`,
        `<div>HP ${t.unit.hp}/${d.hp} · ATK ${d.attack} · moves ${t.unit.movesLeft}</div>`,
      );
    }
    if (t.building) {
      const d = BUILDINGS[t.building.kind];
      bits.push(
        `<div class="t-title" style="color:${FACTIONS[t.building.faction].cssColor}">${d.name} — ${FACTIONS[t.building.faction].name}</div>`,
        seen ? `<div>HP ${t.building.hp}/${d.hp}</div>` : `<div class="t-dim">last known position</div>`,
      );
    }
    bits.push(`<div class="t-dim">${TERRAIN_LABEL[t.terrain]}${t.looted ? " (looted)" : ""}${seen ? "" : " · fogged"}</div>`);
    this.tooltipEl.innerHTML = bits.join("");
    this.tooltipEl.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 260)}px`;
    this.tooltipEl.style.top = `${e.clientY + 14}px`;
    this.tooltipEl.classList.remove("hidden");
  }

  private select(sel: Selection) {
    this.selection = sel;
    this.refresh();
  }

  // --------------------------------------------------------------- rendering

  refresh() {
    this.view.sync(this.game);
    this.renderTopbar();
    this.renderSidepanel();
    this.renderHighlights();
  }

  private renderTopbar() {
    const p = this.game.playerFaction;
    const f = this.game.factions[p];
    const income = this.game.powerIncome(p);
    const tier = this.game.tierOf(p);
    const nextTier = TIERS[tier + 1];
    const rivals = this.game.factions.filter((x, i) => x.alive && i !== p).length;
    this.topbar.innerHTML = `
      <span class="faction-chip" style="background:${f.def.cssColor}">${f.def.name}</span>
      <span class="stat power">⚡ <b>${f.power}</b> <span class="${income < 0 ? "neg" : ""}">(${income >= 0 ? "+" : ""}${income}/t)</span></span>
      <span class="stat compute">▣ <b>${f.compute}</b> (+${this.game.computeIncome(p)}/t)</span>
      <span class="tier">era: <b>${TIERS[tier].name}</b>${nextTier ? ` → ${nextTier.name} at ${nextTier.compute}▣` : ""}</span>
      <span class="spacer"></span>
      <span class="turn">rivals: ${rivals} · turn ${this.game.turn}</span>`;
  }

  private renderSidepanel() {
    const p = this.game.playerFaction;
    const el = this.sidepanel;
    el.innerHTML = "";

    if (this.buildMode) {
      const d = BUILDINGS[this.buildMode];
      el.innerHTML = `<h3>PLACE: ${d.name.toUpperCase()}</h3>
        <div class="sub">${d.desc}</div>
        <div class="hint">Click a green tile to build. Esc to cancel.</div>`;
      return;
    }

    if (!this.selection) {
      el.innerHTML = `<h3>WASTELAND COMMAND</h3>
        <div class="sub">${this.game.factions[p].def.leader} demands progress.</div>
        <div class="hint">
          Left-click: select / move / attack.<br>
          Right-drag or WASD: pan camera. Wheel: zoom.<br>
          Select your Citadel to build and produce.<br>
          Power ⚡ pays for everything. Compute ▣ advances your era.<br>
          Win by razing every rival citadel — or by reaching ${TIERS[TIERS.length - 1].compute}▣ and ascending.
        </div>`;
      return;
    }

    if (this.selection.type === "unit") {
      const u = this.selection.unit;
      const d = UNITS[u.kind];
      const own = u.faction === p;
      el.innerHTML = `<h3 style="color:${FACTIONS[u.faction].cssColor}">${d.name.toUpperCase()}</h3>
        <div class="sub">${FACTIONS[u.faction].name}</div>
        <div class="row">HP ${u.hp}/${d.hp} · ATK ${d.attack} · upkeep ${d.upkeep}⚡</div>
        <div class="row">Moves left: ${u.movesLeft}${u.attacked ? " · has attacked" : ""}</div>
        <hr><div class="hint">${d.desc}</div>`;
      if (own && this.game.canScavenge(u)) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.innerHTML = `SCAVENGE RUINS <span class="cost">+15⚡</span><span class="desc">Strip the old world for parts. Ends this drone's turn.</span>`;
        btn.onclick = () => {
          this.game.scavenge(u);
          this.refresh();
        };
        el.appendChild(btn);
      }
      return;
    }

    if (this.selection.type === "building") {
      const b = this.selection.building;
      const d = BUILDINGS[b.kind];
      const own = b.faction === p;
      el.innerHTML = `<h3 style="color:${FACTIONS[b.faction].cssColor}">${d.name.toUpperCase()}</h3>
        <div class="sub">${FACTIONS[b.faction].name}</div>
        <div class="row">HP ${b.hp}/${d.hp}</div>
        ${d.power ? `<div class="row">Power: ${d.power > 0 ? "+" : ""}${d.power}⚡/turn</div>` : ""}
        ${d.compute ? `<div class="row">Compute: +${d.compute}▣/turn</div>` : ""}
        <hr>`;

      if (own && (b.kind === "citadel" || b.kind === "mechworks")) {
        const h = document.createElement("div");
        h.innerHTML = `<h3>PRODUCE UNIT</h3>`;
        el.appendChild(h);
        for (const opt of this.game.availableUnits(p, b)) {
          const btn = document.createElement("button");
          btn.className = "btn";
          btn.disabled = !opt.ok;
          btn.innerHTML = `${opt.def.name} <span class="cost">${opt.def.cost}⚡</span>
            <span class="desc">ATK ${opt.def.attack} · HP ${opt.def.hp} · move ${opt.def.move} · upkeep ${opt.def.upkeep}⚡${opt.why ? ` — ${opt.why}` : ""}</span>`;
          btn.onclick = () => {
            this.game.tryProduce(p, opt.def.kind, b);
            this.refresh();
          };
          el.appendChild(btn);
        }
      }

      if (own && b.kind === "citadel") {
        const h = document.createElement("div");
        h.innerHTML = `<h3 style="margin-top:10px">CONSTRUCT</h3>`;
        el.appendChild(h);
        for (const opt of this.game.availableBuildings(p)) {
          const btn = document.createElement("button");
          btn.className = "btn";
          btn.disabled = !opt.ok;
          btn.innerHTML = `${opt.def.name} <span class="cost">${opt.cost}⚡</span>
            <span class="desc">${opt.def.desc}${opt.why ? ` — ${opt.why}` : ""}</span>`;
          btn.onclick = () => {
            this.buildMode = opt.def.kind;
            this.refresh();
          };
          el.appendChild(btn);
        }
      }
      return;
    }

    const t = this.selection.tile;
    el.innerHTML = `<h3>TERRAIN</h3>
      <div class="sub">${TERRAIN_LABEL[t.terrain]}${t.looted ? " (looted)" : ""}</div>`;
  }

  private renderHighlights() {
    const p = this.game.playerFaction;
    if (this.buildMode) {
      this.view.setHighlights({ build: this.game.buildablePlots(p) });
      this.view.setSelection(null);
      return;
    }
    if (this.selection?.type === "unit" && this.selection.unit.faction === p) {
      const u = this.selection.unit;
      const move = [...this.game.moveRange(u).keys()]
        .map((k) => {
          const [q, r] = k.split(",").map(Number);
          return { q, r };
        })
        .filter((c) => this.game.isExplored(c.q, c.r));
      this.view.setHighlights({ move, attack: this.game.attackTargets(u) });
      this.view.setSelection(u);
      return;
    }
    this.view.setHighlights({});
    this.view.setSelection(
      this.selection?.type === "building"
        ? this.selection.building
        : this.selection?.type === "tile"
          ? this.selection.tile
          : null,
    );
  }

  private pushLog(msg: string, kind: LogKind = "info") {
    const div = document.createElement("div");
    div.className = `entry ${kind}`;
    div.textContent = msg;
    this.logEl.prepend(div);
    while (this.logEl.children.length > 7) this.logEl.lastChild?.remove();
  }

  // -------------------------------------------------------------------- turn

  private endTurn() {
    if (this.busy || this.game.result) return;
    this.busy = true;
    this.endturnEl.classList.add("waiting");
    this.endturnEl.textContent = "THE TECHNO-KINGS MOVE…";
    this.select(null);

    const p = this.game.playerFaction;
    const aiFactions = this.game.factions
      .map((_, i) => i)
      .filter((i) => i !== p && this.game.factions[i].alive);

    // Stagger AI turns slightly so the carnage is watchable.
    let i = 0;
    const step = () => {
      if (this.game.result) return this.finish();
      if (i < aiFactions.length) {
        runAiTurn(this.game, aiFactions[i]);
        this.game.checkConquest();
        i++;
        this.view.sync(this.game);
        this.renderTopbar();
        setTimeout(step, 260);
        return;
      }
      // Round wrap-up.
      this.game.economy();
      this.game.checkConquest();
      this.game.turn++;
      if (this.game.result) return this.finish();
      // Player's new turn.
      this.game.runTurrets(p);
      this.game.refreshUnits(p);
      this.busy = false;
      this.endturnEl.classList.remove("waiting");
      this.endturnEl.innerHTML = `END TURN <span class="key">⏎</span>`;
      this.refresh();
    };
    setTimeout(step, 150);
  }

  private finish() {
    this.busy = true;
    this.refresh();
    this.onGameOver();
  }
}
