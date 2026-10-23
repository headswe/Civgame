using System;

namespace FireteamHud.Core
{
    public struct Vec2
    {
        public float X;
        public float Y;
        public Vec2(float x, float y) { X = x; Y = y; }
        public override string ToString() => "(" + X.ToString("0.##") + ", " + Y.ToString("0.##") + ")";
    }

    public struct ScreenRect
    {
        public float X, Y, Width, Height;
        public ScreenRect(float x, float y, float w, float h) { X = x; Y = y; Width = w; Height = h; }
        public Vec2 Center => new Vec2(X + Width / 2f, Y + Height / 2f);
    }

    public enum HudAnchor
    {
        TopLeft, TopCenter, TopRight,
        MiddleLeft, Center, MiddleRight,
        BottomLeft, BottomCenter, BottomRight
    }

    public enum Elevation { Level, Above, Below }

    public struct RadarPoint
    {
        /// <summary>Offset from the radar centre in pixels; +X is right, +Y is down (GUI space).</summary>
        public Vec2 Offset;
        /// <summary>True when the player is beyond the radar range and was pinned to the edge.</summary>
        public bool Clamped;
        public float Distance;
    }

    public static class HudMath
    {
        /// <summary>
        /// Projects a teammate onto a heading-up radar.
        /// </summary>
        /// <param name="dx">Teammate X minus own X in metres (Unity world X).</param>
        /// <param name="dz">Teammate Z minus own Z in metres (Unity world Z).</param>
        /// <param name="yawDegrees">Own view yaw: 0 looks along +Z, 90 along +X (Unity's eulerAngles.y).</param>
        /// <param name="range">Metres from the centre to the radar edge.</param>
        /// <param name="radius">Radar radius in pixels.</param>
        public static RadarPoint Project(float dx, float dz, float yawDegrees, float range, float radius)
        {
            double yaw = yawDegrees * Math.PI / 180.0;
            float cos = (float)Math.Cos(yaw), sin = (float)Math.Sin(yaw);

            // Rotate the world into view space: right and forward relative to where we look.
            float right = dx * cos - dz * sin;
            float forward = dx * sin + dz * cos;
            float distance = (float)Math.Sqrt(dx * dx + dz * dz);

            float scale = range > 0 ? radius / range : 0;
            var point = new RadarPoint { Distance = distance, Offset = new Vec2(right * scale, -forward * scale) };

            if (distance > range && distance > 0)
            {
                float k = radius / distance;
                point.Offset = new Vec2(right * k, -forward * k);
                point.Clamped = true;
            }
            return point;
        }

        public static Elevation ElevationOf(float dy, float threshold)
        {
            if (dy > threshold) return Elevation.Above;
            if (dy < -threshold) return Elevation.Below;
            return Elevation.Level;
        }

        /// <summary>Places a box of the given size at an anchor on screen, then shifts it by the offset.</summary>
        public static ScreenRect Place(HudAnchor anchor, float offsetX, float offsetY, float width, float height,
            float screenWidth, float screenHeight)
        {
            int column = (int)anchor % 3; // 0 left, 1 centre, 2 right
            int row = (int)anchor / 3;    // 0 top, 1 middle, 2 bottom

            float x = column == 0 ? 0 : column == 1 ? (screenWidth - width) / 2f : screenWidth - width;
            float y = row == 0 ? 0 : row == 1 ? (screenHeight - height) / 2f : screenHeight - height;

            x += offsetX;
            y += offsetY;

            // Never let a bad offset push the HUD fully off screen.
            x = Clamp(x, 0, Math.Max(0, screenWidth - width));
            y = Clamp(y, 0, Math.Max(0, screenHeight - height));
            return new ScreenRect(x, y, width, height);
        }

        public static string FormatDistance(float metres) =>
            metres >= 1000 ? (metres / 1000f).ToString("0.0") + "km" : ((int)Math.Round(metres)) + "m";

        static float Clamp(float v, float min, float max) => v < min ? min : v > max ? max : v;
    }
}
