namespace FireteamHud.Core
{
    public struct Rgba
    {
        public float R, G, B, A;
        public Rgba(float r, float g, float b, float a = 1f) { R = r; G = g; B = b; A = a; }
    }

    /// <summary>
    /// Default player colours. The first four are STHUD's fireteam colours; after that the
    /// palette keeps going so a full Fika lobby still gets distinct colours.
    /// </summary>
    public static class Palette
    {
        public static readonly Rgba Red = new Rgba(0.93f, 0.26f, 0.26f);
        public static readonly Rgba Green = new Rgba(0.30f, 0.85f, 0.35f);
        public static readonly Rgba Blue = new Rgba(0.30f, 0.55f, 1.00f);
        public static readonly Rgba Yellow = new Rgba(0.98f, 0.86f, 0.25f);
        public static readonly Rgba White = new Rgba(0.95f, 0.95f, 0.95f);
        public static readonly Rgba Dead = new Rgba(0.45f, 0.45f, 0.45f, 0.8f);

        static readonly Rgba[] Defaults =
        {
            Red, Green, Blue, Yellow,
            new Rgba(1.00f, 0.55f, 0.15f), // orange
            new Rgba(0.75f, 0.40f, 1.00f), // purple
            new Rgba(0.25f, 0.90f, 0.90f), // cyan
            new Rgba(1.00f, 0.45f, 0.75f), // pink
            White
        };

        /// <summary>Colour for the n-th teammate seen (0-based), wrapping around.</summary>
        public static Rgba ForIndex(int index)
        {
            if (index < 0) index = 0;
            return Defaults[index % Defaults.Length];
        }
    }
}
