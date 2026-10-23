using UnityEngine;

namespace FireteamHud
{
    /// <summary>White shapes generated at startup and tinted with GUI.color, so no asset bundle is needed.</summary>
    public static class Textures
    {
        public static Texture2D Disc { get; private set; }
        public static Texture2D Ring { get; private set; }
        public static Texture2D ThinRing { get; private set; }
        public static Texture2D TriangleUp { get; private set; }
        public static Texture2D TriangleDown { get; private set; }
        public static Texture2D Pixel { get; private set; }

        public static void Create()
        {
            if (Disc != null) return;
            Disc = Circle(64, 0f);
            Ring = Circle(64, 0.22f);
            ThinRing = Circle(256, 0.012f);
            TriangleUp = Triangle(32, true);
            TriangleDown = Triangle(32, false);
            Pixel = Make(1, (x, y) => 1f);
        }

        /// <summary>Anti-aliased circle; <paramref name="thickness"/> is a fraction of the radius, 0 for filled.</summary>
        static Texture2D Circle(int size, float thickness)
        {
            float r = size / 2f;
            return Make(size, (x, y) =>
            {
                float d = Mathf.Sqrt((x + 0.5f - r) * (x + 0.5f - r) + (y + 0.5f - r) * (y + 0.5f - r));
                float outer = Mathf.Clamp01(r - d);
                if (thickness <= 0f) return outer;
                float inner = Mathf.Clamp01(d - r * (1f - thickness));
                return Mathf.Min(outer, inner);
            });
        }

        static Texture2D Triangle(int size, bool up)
        {
            return Make(size, (x, y) =>
            {
                // Row 0 is the bottom of the image, so an upward triangle has its tip in the last row.
                float t = up ? (y + 0.5f) / size : 1f - (y + 0.5f) / size; // 0 at base, 1 at tip
                float half = (1f - t) * size / 2f;
                float dx = Mathf.Abs(x + 0.5f - size / 2f);
                return Mathf.Clamp01(half - dx + 0.5f);
            });
        }

        static Texture2D Make(int size, System.Func<int, int, float> alpha)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
                hideFlags = HideFlags.HideAndDontSave
            };
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                    pixels[y * size + x] = new Color32(255, 255, 255, (byte)(alpha(x, y) * 255f));
            tex.SetPixels32(pixels);
            tex.Apply();
            return tex;
        }
    }
}
