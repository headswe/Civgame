import { FACTIONS, TIERS } from "./content";
import { Game } from "./game";
import { SceneView } from "./scene";
import { GameUI } from "./ui";

const overlay = document.getElementById("overlay")!;
let view: SceneView | null = null;

function showFactionSelect() {
  overlay.innerHTML = `
    <div class="menu">
      <h1>⚡ POWER</h1>
      <div class="tagline">The world ended. The server farms didn't. Long live the techno-kings.</div>
      <div class="howto">
        Power is the only currency that survived the Collapse — it builds your war machines,
        feeds your <b>AI servers</b>, and keeps the lights on in your citadel.
        Compute ▣ marches you through the eras of machine intelligence:
        ${TIERS.map((t) => t.name).join(" → ")}.
        Raze every rival citadel, or accumulate ${TIERS[TIERS.length - 1].compute}▣ and ascend beyond the need for subjects entirely.
      </div>
      <h2>CHOOSE YOUR TECHNO-KING</h2>
      <div class="faction-grid">
        ${FACTIONS.map(
          (f, i) => `
          <div class="faction-card" data-i="${i}" style="border-top: 3px solid ${f.cssColor}">
            <div class="fname" style="color:${f.cssColor}">${f.name}</div>
            <div class="fleader">${f.leader}</div>
            <div class="fperk"><b>${f.perk}</b> — ${f.perkDesc}</div>
            <div class="fquote">${f.quotes[0]}</div>
          </div>`,
        ).join("")}
      </div>
    </div>`;
  overlay.querySelectorAll<HTMLElement>(".faction-card").forEach((card) => {
    card.onclick = () => startGame(Number(card.dataset.i));
  });
}

function startGame(faction: number) {
  overlay.innerHTML = "";
  document.getElementById("log")!.innerHTML = "";

  const game = new Game(faction);
  const canvas = document.getElementById("scene") as HTMLCanvasElement;
  if (!view) view = new SceneView(canvas);
  view.buildMap(game);
  view.sync(game);

  const citadel = game.buildings.find((b) => b.faction === faction && b.kind === "citadel")!;
  view.centerOn(citadel.q, citadel.r);

  new GameUI(game, view, () => showGameOver(game));

  // Dev hooks for debugging and automated playtests.
  (window as unknown as Record<string, unknown>).__game = game;
  (window as unknown as Record<string, unknown>).__view = view;

  game.log(`You are ${FACTIONS[faction].leader} of the ${FACTIONS[faction].name}. The wasteland awaits your disruption.`, "quote");
  game.log(FACTIONS[faction].quotes[1] ?? FACTIONS[faction].quotes[0], "quote");
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
      <h1>${title}</h1>
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
