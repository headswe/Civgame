# SPT Stash MCP

A BepInEx client plugin for SPT 4.0 (works with Fika installed) that exposes your stash
to Claude, or any other MCP client, as an MCP server on `http://127.0.0.1:27150/mcp`.

Claude can then read the stash and sort it by your own rules, for example "all keys into
the keytool, ammo into the ammo case grouped by caliber". Every move goes through the
game's own `InventoryController`, so the SPT server receives normal inventory
operations and the profile stays consistent. The profile JSON is never edited directly.

## How it fits with Fika

Fika only syncs raids. Outside a raid your client talks to the SPT server just like in
singleplayer, and the stash lives in your normal profile under `user/profiles/`. The
plugin therefore:

- runs only in **your** client, so no server mod and no Fika integration are needed
- refuses to touch the inventory while a `GameWorld` is loaded (raid or hideout).
  Use it from the main menu.

## Tools

| Tool | What it does |
| --- | --- |
| `get_status` | Whether the stash can be used right now, and why not if it can't. |
| `list_containers` | The stash and every container in it (cases, backpacks, rigs, keytools), with grids, sizes and free cells. |
| `list_items` | Items in a container (the stash by default). Each item has its id, template, name, size, grid position, `kinds` (class hierarchy), `templateParents` (category ids) and `caliber` for ammo. Supports `recursive`, `query` and `limit`. |
| `move_item` | Moves one item into a container. Give `gridIndex`/`x`/`y`/`rotated` yourself, or leave out x/y and the game picks the first free spot. |
| `sort_by_rules` | Moves loose items from the stash root (or from `sourceContainerIds`) into containers according to ordered rules. **`dryRun` defaults to true** and only returns the plan. |

### Rules

The first rule that matches an item wins. Inside a rule, every filter you set must
match. Inside a list, any one entry is enough.

```json
{
  "rules": [
    { "targetContainerId": "<keytool id>",  "kinds": ["KeyItemClass"] },
    { "targetContainerId": "<keycard case>", "parentTemplateIds": ["5c164d2286f774194c5e69fa"] },
    { "targetContainerId": "<ammo case>",   "parentTemplateIds": ["5485a8684bdc2da71d8b4567"], "sortBy": "caliber" },
    { "targetContainerId": "<meds case>",   "nameContains": ["Salewa", "IFAK", "AFAK", "Grizzly"], "sortBy": "size" }
  ],
  "dryRun": true
}
```

Filters: `templateIds`, `parentTemplateIds`, `kinds`, `calibers`, `nameContains`.
`sortBy` sets the placement order: `name` (default), `caliber`, `size` (largest first,
which packs best) or `none`. Rules never move contents out of backpacks or rigs,
attachments, loaded ammo, or the target containers themselves.

## Install

1. Build it (see below), or take `SptStashMcp.dll` from a release.
2. Copy it to `<SPT>\BepInEx\plugins\SptStashMcp\SptStashMcp.dll`.
3. Start the game. `BepInEx\LogOutput.log` should contain
   `MCP endpoint listening on http://127.0.0.1:27150/mcp`.
4. Optional: change `Port` or set a `BearerToken` in
   `BepInEx\config\com.headswe.sptstashmcp.cfg`.

### Connect Claude

Claude Code:

```sh
claude mcp add --transport http spt-stash http://127.0.0.1:27150/mcp
# with a token:
claude mcp add --transport http spt-stash http://127.0.0.1:27150/mcp --header "Authorization: Bearer <token>"
```

Claude Desktop (`claude_desktop_config.json`), through the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "spt-stash": { "command": "npx", "args": ["-y", "mcp-remote", "http://127.0.0.1:27150/mcp"] }
  }
}
```

Then ask something like: *"List my containers, then sort all keys into the keytool and
all ammo into the ammo case by caliber. Show me the dry run first."*

## Build

The plugin is compiled against your own SPT install, which is not in this repo:

```sh
dotnet build src/SptStashMcp.Plugin -c Release -p:SptDir="C:\SPT"
```

The output is `src/SptStashMcp.Plugin/bin/Release/SptStashMcp.dll`.

The game-independent code (MCP protocol, HTTP transport, tool definitions and the sort
planner) lives in `src/SptStashMcp.Core`. The plugin build compiles it into the same
DLL, so it uses the game's `Newtonsoft.Json`. It has its own tests and needs no game
files to run them:

```sh
dotnet test tests/SptStashMcp.Tests
```

## Status and caveats

- **Not yet tested in-game.** The core is unit-tested, including the HTTP transport.
  The game-facing code in `src/SptStashMcp.Plugin/EftStashBackend.cs` has only been
  compile-checked against stubs of the EFT API. It uses SPT's remapped names
  (`InventoryController`, `CompoundItem`, `InteractionsHandlerClass.Move`,
  `TryRunNetworkTransaction`, `ItemUiContext`, `LocationInGrid`). If an SPT update
  renames one of them, the build fails in that file and only that file needs fixing.
  Members that change often (grid sizes, template parents, calibers) are read by
  reflection with fallbacks.
- The first in-game test should be `list_containers` and `list_items`, then a single
  `move_item`, before you run `sort_by_rules` with `dryRun: false`.
- Back up `user/profiles/<id>.json` on the server before your first large sort.
- The endpoint only listens on loopback and rejects browser requests from other
  origins. Set a `BearerToken` if other software on your PC should not reach it.
