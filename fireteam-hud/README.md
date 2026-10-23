# Fireteam HUD

An STHUD-style squad HUD for SPT 4.0 + Fika. It's a client-side BepInEx plugin, so
there is nothing to install on the server.

- **Radar:** turns with your view, so up is where you're looking. Every teammate is a dot
  in their own colour. A teammate beyond the range is pinned to the rim as a hollow ring.
  Small ▲/▼ arrows show when someone is above or below you, such as upstairs or in a
  basement. The arrow in the centre is you.
- **Name list:** a list next to the radar with a colour swatch, name and distance for each
  teammate. Teammates who die show `KIA` and stay greyed out. Teammates who extract or
  disconnect show `—`.
- **Per-player colours:** the first four are STHUD's red, green, blue and yellow, then
  orange, purple, cyan, pink and white. Each nickname gets its own colour entry the first
  time you raid together, so your friends keep their colours from raid to raid. You can
  change any of them.
- **Configurable area:** all settings are live in the BepInEx Configuration Manager
  (F12): anchor to any of 9 screen positions, X/Y offset, scale, size, range, opacity,
  background, and which side the list goes on.

The HUD only appears in raid while you have teammates. Press **Home** to hide it.

## Install

1. Build it (see below).
2. Copy `FireteamHud.dll` to `<SPT>\BepInEx\plugins\FireteamHud\`.
3. Every player who wants the HUD installs it on their own client. It isn't needed on
   the Fika headless client or on the server.

## Setting it up

1. Open F12 → *Fireteam HUD* and turn on **Preview**. This shows four dummy teammates
   circling you, in the main menu as well as in raid. One is above you, one below, one is
   beyond range, and one keeps dying.
2. Adjust the **Layout** settings until it sits where you want it, for example the
   default *BottomCenter* with Offset Y `-90` above the stance and health indicators.
3. Turn Preview off before you play.

| Section | Settings |
| --- | --- |
| General | Enabled, toggle key, Preview, teammate source |
| Layout | Anchor (9 positions), Offset X/Y, Scale, Opacity, Background opacity |
| Radar | Show, Size, Range (m), Dot size, out-of-range rings, elevation arrow threshold, self arrow, half-range ring |
| Name list | Show, Side (left/right), Width, Font size, Distance, keep dead/gone |
| Colours | Your own arrow colour |
| Player colours | One entry per teammate nickname, added automatically |

## Who counts as a teammate

`General → Teammates`:

- **Auto** (default): uses Fika's `CoopHandler.HumanPlayers`, which holds every human in
  your Fika raid. Without Fika it falls back to *SameGroup*.
- **FikaHumans**: uses Fika's list only.
- **SameGroup**: human players with the same group id as you.

Fika is found by reflection at runtime. The plugin doesn't reference it, so the plugin
still loads without Fika, and Preview works in plain SPT.

The HUD only shows your own squad. It never shows bots or other players.

## Build

```sh
dotnet build src/FireteamHud.Plugin -c Release -p:SptDir="C:\SPT"
dotnet test tests/FireteamHud.Tests   # radar maths, layout and roster; no game files needed
```

Layout:

- `src/FireteamHud.Core`: the game-independent parts, with unit tests.
  - radar projection
  - placing the HUD on screen
  - the roster that tracks alive, dead and gone teammates
  - the palette
- `src/FireteamHud.Plugin`: the BepInEx plugin.
  - `SquadSource.cs`: the only file that touches EFT or Fika
  - `HudRenderer.cs`: IMGUI drawing
  - `HudConfig.cs`: settings
  - `Textures.cs`: generated shapes, so the plugin needs no asset bundle

## Status

- **Not yet tested in-game.** The core has unit tests. The plugin compiles against the
  real BepInEx 5.4 and Unity 2022.3 APIs, but EFT's classes were stubbed for the check.
- The EFT members it uses are `GameWorld.MainPlayer`, `GameWorld.AllAlivePlayersList`,
  `Player.Position`, `Player.Rotation`, `Player.ProfileId`, `Player.Profile.Nickname`,
  `Player.Profile.Info.GroupId`, `Player.IsAI` and `Player.HealthController.IsAlive`. If
  your SPT version renames one of them, the build fails in `SquadSource.cs`.
- The view direction comes from `Camera.main`. If that is null, it falls back to the
  player's yaw.
