# ⚡ POWER

*The world ended. The server farms didn't. Long live the techno-kings.*

A post-apocalyptic civ game in 3D isometric style. After the Collapse, the world
was feudalized by techno-kings ruling from their citadels. **Power is the only
currency** — it builds your war machines, feeds your AI servers, and keeps the
lights on. **Compute** marches you through the eras of machine intelligence,
from the Salvage Age to the Singularity.

Alpha Centauri energy, but the faction leaders are parodies of people you have
definitely seen on a livestream.

## Play

```sh
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:5173).

## How it works

- **Power ⚡** — the sole currency. Buildings and units cost power; units drain
  upkeep every turn. Go negative and the grid browns out, damaging your army.
- **Compute ▣** — produced by Server Racks. Accumulated compute advances your
  era: Salvage Age → Chatbot Era → Agentic Era → AGI (Trust Us This Time) →
  **The Singularity** (instant victory at 260▣).
- **Win** by razing every rival citadel, or by ascending via compute.
- **Fog of war** — the wasteland starts unknown. Units and buildings project
  sight (drones and citadels see furthest); explored ground stays on the map as
  dim memory, but enemy units only exist where you can currently see.
- Scavenge pre-Collapse **ruins** with drones for +15⚡ lump sums.
- Build **Fusion Reactors** on geothermal vents for +5⚡ bonus.
- **Turrets** auto-fire at adjacent enemies. **Slag flows** are impassable.

### The techno-kings

| Faction | Leader | Perk |
| --- | --- | --- |
| Dominion of X | Baron Elom Tusk | +1 movement on all units |
| The Zuckerborg Collective | Overlord Mark Zuckerborg | Server racks +1▣/turn |
| Prime Caliphate | God-CEO Beff Jezos | Buildings cost 20% less |
| ClosedAI Papacy | Prophet Sam Saltman | Starts with +25▣ compute |

*All persons depicted are parodies; any resemblance to billionaires living or
cryopreserved is entirely the point.*

Each techno-king's citadel is themed after their empire and physically grows
with every era — from launch pads and warehouse-cathedrals to floating X
emblems, all-watching orbs, and haloed obelisks.

## Controls

- **Left-click** — select / move / attack
- **Right-drag or WASD/arrows** — pan camera, **wheel** — zoom
- **Enter** — end turn, **Esc** — cancel / deselect, **M** — mute audio
- Select your **Citadel** to construct buildings and produce units

## Stack

Vite + TypeScript + Three.js. Every mesh is procedural — no art assets required.

### Optional: AI-generated ground textures

Tile tops can be draped with generated ground textures. Generate them with an
Azure OpenAI gpt-image deployment (the key is read from the environment and
must never be committed):

```sh
IMAGE_API_KEY=<your key> node scripts/generate-textures.mjs          # all terrains
IMAGE_API_KEY=<your key> node scripts/generate-textures.mjs wastes   # just one
```

Textures land in `public/textures/ground_<terrain>.png`. Commit them and the
game picks them up automatically; missing textures fall back to the flat
palette colors.
