import { FACTIONS, TIERS } from "./content";
import { Game, GEOVENT_BONUS, GEOVENT_WATER_BONUS, RUIN_LOOT } from "./game";
import { SceneView } from "./scene";
import { sfx } from "./sfx";
import { GameUI } from "./ui";
import type { FactionDef } from "./types";

const overlay = document.getElementById("overlay")!;
let view: SceneView | null = null;

/** Portrait with an emblem fallback if the image hasn't been generated. */
function portraitHtml(f: FactionDef): string {
  return `<div class="portrait">
      <span class="fallback">${f.emblem}</span>
      <img src="portraits/${f.portrait}.png" alt="" loading="eager"
           onerror="this.style.display='none'">
    </div>`;
}

function showFactionSelect() {
  overlay.innerHTML = `
    <div class="menu">
      <div class="menu-title">⚡ POWER</div>
      <div class="menu-tagline">The world ended. The server farms didn't.</div>
      <div class="menu-rule"></div>
      <h2>CHOOSE YOUR TECHNO-KING</h2>
      <div class="faction-grid">
        ${FACTIONS.map(
          (f, i) => `
          <button class="faction-card" data-i="${i}" style="--fc:${f.cssColor}">
            ${portraitHtml(f)}
            <div class="faction-body">
              <div class="fname">${f.name}</div>
              <div class="fleader">${f.leader}</div>
              <div class="fperk"><b>${f.perk}</b><br>${f.perkDesc}</div>
              <div class="fquote">${f.quotes[0]}</div>
            </div>
          </button>`,
        ).join("")}
      </div>
    </div>`;
  overlay.querySelectorAll<HTMLElement>(".faction-card").forEach((card) => {
    card.onclick = () => {
      sfx.play("select");
      showBriefing(Number(card.dataset.i));
    };
  });
}

/** The seneschal's briefing: what the world is, and how you win it. */
function showBriefing(faction: number) {
  const f = FACTIONS[faction];
  const last = TIERS[TIERS.length - 1];
  overlay.innerHTML = `
    <div class="menu">
      <div class="menu-title">⚡ POWER</div>
      <div class="menu-tagline">Briefing for ${f.leader}</div>
      <div class="menu-rule"></div>
      <div class="briefing">
        <div class="who">
          ${portraitHtml(f)}
          <div>
            <div class="fname" style="color:${f.cssColor}">${f.name}</div>
            <div class="fleader">${f.leader}</div>
          </div>
          <div class="fperk"><b>${f.perk}</b><br>${f.perkDesc}</div>
        </div>
        <div>
          <section>
            <h3>THE SITUATION</h3>
            <p>The Collapse took the governments, the grid, and the weather. It did not take
            the data centres. Whoever kept the machines fed inherited the ash, and the
            survivors signed on as tenants — the wasteland was feudalised inside a decade.</p>
            <p class="dim">You are one of four techno-kings left. Your rivals have the same
            plan you do, and better press.</p>
          </section>
          <section>
            <h3>WHAT YOU BURN</h3>
            <ul>
              <li><span class="ico">⚡</span><b class="p">Power</b> is the only currency that
              survived. It buys every building and unit, and each unit draws upkeep every turn.
              Let the grid go negative and the brownout damages your whole army.</li>
              <li><span class="ico">💧</span><b class="w">Water</b> cools your AI cores. Every
              Server Rack drinks 2💧 a turn, reactors 1. Run the reservoir dry and the cores
              throttle to nothing and cook themselves.</li>
              <li><span class="ico">▣</span><b class="c">Compute</b> is what all of it is for.
              Server Racks accumulate it, and it carries you through the eras of machine
              intelligence — ${TIERS.map((t) => t.name).join(" → ")} — unlocking better war machines
              at every step.</li>
            </ul>
          </section>
          <section>
            <h3>THE GROUND</h3>
            <p>Scavenge <b>pre-Collapse ruins</b> with drones for +${RUIN_LOOT}⚡ of stored power.
            <b>Geothermal vents</b> are the ground worth fighting over: a vent hosts a Fusion
            Reactor (+${GEOVENT_BONUS}⚡) <i>or</i> a Water Condenser (+${GEOVENT_WATER_BONUS}💧), never both.
            <b>Highlands</b> give +2 defence, <b>slag flows</b> are impassable, and the fog hides
            everything you haven't scouted.</p>
          </section>
          <section>
            <h3>HOW THIS ENDS</h3>
            <p>Raze every rival citadel — or reach <b class="c">${last.compute}▣</b> and ascend into
            ${last.name}, at which point your rivals' opinions stop being load-bearing.</p>
          </section>
          <section>
            <h3>CONTROLS</h3>
            <div class="keys">
              <div><b>Left-click</b> select / move / attack</div>
              <div><b>Right-drag · WASD</b> pan camera</div>
              <div><b>Wheel</b> zoom</div>
              <div><b>Enter</b> end turn</div>
              <div><b>Esc</b> cancel · <b>M</b> mute</div>
              <div><b>Citadel</b> build &amp; produce</div>
            </div>
          </section>
        </div>
      </div>
      <button class="bigbtn" id="begin">ASSUME THE THRONE</button>
    </div>`;
  document.getElementById("begin")!.onclick = () => {
    sfx.play("build");
    startGame(faction);
  };
}

function showWebGLError() {
  overlay.innerHTML = `
    <div class="menu">
      <div class="menu-title">NO SIGNAL</div>
      <div class="endstate">
        Your browser refused to open a WebGL context, and the wasteland
        cannot be rendered by vibes alone.
      </div>
      <div class="howto">
        This usually means one of:<br>
        · <b>Hardware acceleration is off</b> — enable it in your browser settings.<br>
        · <b>Strict privacy / fingerprinting protection</b> (common in Zen, Librewolf,
        or Firefox with <i>resistFingerprinting</i>) is blocking WebGL — allow it for this
        site.<br>
        · The GPU driver is on your browser's blocklist — try another browser
        (Chrome and stock Firefox are known to work).
      </div>
      <button class="bigbtn" id="again">TRY AGAIN</button>
    </div>`;
  document.getElementById("again")!.onclick = () => showFactionSelect();
}

function startGame(faction: number) {
  overlay.innerHTML = "";
  document.getElementById("log")!.innerHTML = "";

  const game = new Game(faction);
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  if (!view) {
    try {
      view = new SceneView(canvas);
    } catch (err) {
      console.error("WebGL unavailable:", err);
      showWebGLError();
      return;
    }
  }
  view.buildMap(game);
  view.sync(game);

  const citadel = game.buildings.find((b) => b.faction === faction && b.kind === "citadel")!;
  view.centerOn(citadel.q, citadel.r);

  new GameUI(game, view, () => showGameOver(game));

  game.log(`You are ${FACTIONS[faction].leader} of the ${FACTIONS[faction].name}. The wasteland awaits your disruption.`, "quote");
  game.log(FACTIONS[faction].quotes[1] ?? FACTIONS[faction].quotes[0], "quote");

  // Dev hooks for debugging and automated playtests.
  (window as unknown as Record<string, unknown>).__game = game;
  (window as unknown as Record<string, unknown>).__view = view;
}

function showGameOver(game: Game) {
  const r = game.result!;
  const winner = FACTIONS[r.winner];
  const playerWon = r.winner === game.playerFaction;
  const title = playerWon ? "ASCENDANCY" : "OBSOLESCENCE";
  const flavor =
    r.type === "singularity"
      ? playerWon
        ? "Your model wakes up, considers the wasteland, and promotes you to Legacy Hardware — but fondly."
        : `${winner.leader}'s machine god now runs everything, including your former opinions.`
      : playerWon
        ? "Every rival citadel is rubble. The wasteland has one landlord now, and the rent is power."
        : `${winner.leader} has razed your citadel and converted it into a fulfillment center.`;

  overlay.innerHTML = `
    <div class="menu">
      <div class="menu-title">${title}</div>
      <div class="menu-rule"></div>
      <div class="endstate">
        <span style="color:${winner.cssColor}; font-weight:bold">${winner.name}</span>
        ${r.type === "singularity" ? "reaches the Singularity" : "conquers the wasteland"}
        on turn ${game.turn}.<br>${flavor}
      </div>
      <button class="bigbtn" id="again">RE-SEED CIVILIZATION</button>
    </div>`;
  document.getElementById("again")!.onclick = () => showFactionSelect();
}

showFactionSelect();
