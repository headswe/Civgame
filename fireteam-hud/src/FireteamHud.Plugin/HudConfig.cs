using System.Collections.Generic;
using System.Text;
using BepInEx.Configuration;
using FireteamHud.Core;
using UnityEngine;

namespace FireteamHud
{
    public enum TeammateSource
    {
        /// <summary>Fika's list of human players when Fika is loaded, otherwise same group id.</summary>
        Auto,
        FikaHumans,
        SameGroup
    }

    public enum ListSide { Left, Right }

    /// <summary>
    /// All settings, editable live in the BepInEx Configuration Manager (F12 by default).
    /// </summary>
    public class HudConfig
    {
        readonly ConfigFile _file;
        readonly Dictionary<string, ConfigEntry<Color>> _playerColours = new Dictionary<string, ConfigEntry<Color>>();

        public ConfigEntry<bool> Enabled;
        public ConfigEntry<KeyboardShortcut> ToggleKey;
        public ConfigEntry<bool> Preview;
        public ConfigEntry<TeammateSource> Source;

        public ConfigEntry<HudAnchor> Anchor;
        public ConfigEntry<int> OffsetX;
        public ConfigEntry<int> OffsetY;
        public ConfigEntry<float> Scale;
        public ConfigEntry<float> Opacity;
        public ConfigEntry<float> BackgroundOpacity;

        public ConfigEntry<bool> ShowRadar;
        public ConfigEntry<int> RadarSize;
        public ConfigEntry<float> Range;
        public ConfigEntry<int> DotSize;
        public ConfigEntry<bool> ShowOutOfRange;
        public ConfigEntry<float> ElevationThreshold;
        public ConfigEntry<bool> ShowSelf;
        public ConfigEntry<bool> ShowRangeRing;

        public ConfigEntry<bool> ShowNameList;
        public ConfigEntry<ListSide> NameListSide;
        public ConfigEntry<int> NameListWidth;
        public ConfigEntry<int> FontSize;
        public ConfigEntry<bool> ShowDistance;
        public ConfigEntry<bool> ShowGone;

        public ConfigEntry<Color> SelfColour;

        public HudConfig(ConfigFile file)
        {
            _file = file;

            const string general = "1. General";
            Enabled = file.Bind(general, "Enabled", true, "Show the HUD.");
            ToggleKey = file.Bind(general, "Toggle key", new KeyboardShortcut(KeyCode.Home), "Shows or hides the HUD in raid.");
            Preview = file.Bind(general, "Preview", false,
                "Shows four dummy teammates, also in the menus, so you can position and style the HUD. Turn off before playing.");
            Source = file.Bind(general, "Teammates", TeammateSource.Auto,
                "Who counts as your squad. Auto uses Fika's human players and falls back to players with your group id.");

            const string layout = "2. Layout";
            Anchor = file.Bind(layout, "Anchor", HudAnchor.BottomCenter, "Screen corner or edge the HUD is attached to.");
            OffsetX = file.Bind(layout, "Offset X", 0, new ConfigDescription("Pixels right (+) or left (-) of the anchor.",
                new AcceptableValueRange<int>(-4000, 4000)));
            OffsetY = file.Bind(layout, "Offset Y", -90, new ConfigDescription("Pixels down (+) or up (-) from the anchor.",
                new AcceptableValueRange<int>(-4000, 4000)));
            Scale = file.Bind(layout, "Scale", 1f, new ConfigDescription("Overall size multiplier.",
                new AcceptableValueRange<float>(0.5f, 3f)));
            Opacity = file.Bind(layout, "Opacity", 0.9f, new ConfigDescription("Opacity of dots and text.",
                new AcceptableValueRange<float>(0.1f, 1f)));
            BackgroundOpacity = file.Bind(layout, "Background opacity", 0.3f, new ConfigDescription("0 for no background.",
                new AcceptableValueRange<float>(0f, 1f)));

            const string radar = "3. Radar";
            ShowRadar = file.Bind(radar, "Show radar", true, "Heading-up radar with a dot per teammate.");
            RadarSize = file.Bind(radar, "Size", 150, new ConfigDescription("Diameter in pixels before scaling.",
                new AcceptableValueRange<int>(60, 600)));
            Range = file.Bind(radar, "Range (m)", 40f, new ConfigDescription("Distance from the centre to the edge of the radar.",
                new AcceptableValueRange<float>(5f, 500f)));
            DotSize = file.Bind(radar, "Dot size", 10, new ConfigDescription("Teammate dot diameter in pixels before scaling.",
                new AcceptableValueRange<int>(4, 40)));
            ShowOutOfRange = file.Bind(radar, "Show out of range", true, "Pin teammates beyond the range to the edge as hollow rings.");
            ElevationThreshold = file.Bind(radar, "Elevation arrows (m)", 3f, new ConfigDescription(
                "Draw an up or down arrow on a dot when the height difference exceeds this. 0 disables.",
                new AcceptableValueRange<float>(0f, 50f)));
            ShowSelf = file.Bind(radar, "Show self", true, "Arrow in the centre showing where you look.");
            ShowRangeRing = file.Bind(radar, "Show half-range ring", true, "Faint ring at half the range.");

            const string list = "4. Name list";
            ShowNameList = file.Bind(list, "Show name list", true, "Coloured list of teammates beside the radar.");
            NameListSide = file.Bind(list, "Side", ListSide.Right, "Which side of the radar the list goes on.");
            NameListWidth = file.Bind(list, "Width", 170, new ConfigDescription("List width in pixels before scaling.",
                new AcceptableValueRange<int>(80, 600)));
            FontSize = file.Bind(list, "Font size", 13, new ConfigDescription("Before scaling.", new AcceptableValueRange<int>(8, 40)));
            ShowDistance = file.Bind(list, "Show distance", true, "Distance to each teammate.");
            ShowGone = file.Bind(list, "Show dead and gone", true, "Keep teammates who died or left in the list, greyed out.");

            SelfColour = file.Bind("5. Colours", "Self", Color.white, "Colour of your own arrow.");
        }

        /// <summary>
        /// Colour for a player. Each new nickname gets its own entry under "Player colours",
        /// seeded from the STHUD palette, so a friend keeps the same colour every raid.
        /// </summary>
        public Color ColourFor(string nickname, int joinIndex)
        {
            var key = SanitiseKey(nickname);
            if (!_playerColours.TryGetValue(key, out var entry))
            {
                var d = Palette.ForIndex(joinIndex);
                entry = _file.Bind("6. Player colours", key, new Color(d.R, d.G, d.B, d.A),
                    "Colour for " + nickname + ". Added automatically the first time you raid together.");
                _playerColours[key] = entry;
            }
            return entry.Value;
        }

        /// <summary>BepInEx config keys can't contain = \n \t \\ " ' [ ].</summary>
        static string SanitiseKey(string name)
        {
            if (string.IsNullOrEmpty(name)) return "Unknown";
            var sb = new StringBuilder(name.Length);
            foreach (var c in name) sb.Append("=\n\t\\\"'[]".IndexOf(c) >= 0 ? '_' : c);
            return sb.ToString().Trim();
        }
    }
}
