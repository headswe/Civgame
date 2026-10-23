using FireteamHud.Core;
using Xunit;

namespace FireteamHud.Tests
{
    public class HudMathTests
    {
        const float Eps = 0.01f;

        [Theory]
        // Looking north (+Z): a mate 10 m north is straight up on the radar.
        [InlineData(0, 10, 0, 0, -50)]
        // Looking north: a mate 10 m east is to the right.
        [InlineData(10, 0, 0, 50, 0)]
        // Looking east (+X): a mate to the east is now straight ahead...
        [InlineData(10, 0, 90, 0, -50)]
        // ...and one to the north is on the left.
        [InlineData(0, 10, 90, -50, 0)]
        // Looking south: a mate to the north is behind us.
        [InlineData(0, 10, 180, 0, 50)]
        public void Project_IsHeadingUp(float dx, float dz, float yaw, float ex, float ey)
        {
            // 20 m range on a 100 px radius → 5 px per metre.
            var p = HudMath.Project(dx, dz, yaw, 20, 100);
            Assert.Equal(ex, p.Offset.X, 2);
            Assert.Equal(ey, p.Offset.Y, 2);
            Assert.False(p.Clamped);
            Assert.Equal(10, p.Distance, 2);
        }

        [Fact]
        public void Project_ClampsToEdgeBeyondRange()
        {
            var p = HudMath.Project(300, 400, 0, 100, 80);
            Assert.True(p.Clamped);
            Assert.Equal(500, p.Distance, 2);
            Assert.Equal(80 * 0.6f, p.Offset.X, 2);
            Assert.Equal(-80 * 0.8f, p.Offset.Y, 2);
        }

        [Fact]
        public void Project_SamePositionIsCentre()
        {
            var p = HudMath.Project(0, 0, 37, 50, 100);
            Assert.True(System.Math.Abs(p.Offset.X) < Eps && System.Math.Abs(p.Offset.Y) < Eps);
        }

        [Theory]
        [InlineData(HudAnchor.TopLeft, 0, 0)]
        [InlineData(HudAnchor.Center, 860, 490)]
        [InlineData(HudAnchor.BottomCenter, 860, 980)]
        [InlineData(HudAnchor.BottomRight, 1720, 980)]
        public void Place_Anchors(HudAnchor anchor, float ex, float ey)
        {
            var r = HudMath.Place(anchor, 0, 0, 200, 100, 1920, 1080);
            Assert.Equal(ex, r.X);
            Assert.Equal(ey, r.Y);
        }

        [Fact]
        public void Place_AppliesOffsetButStaysOnScreen()
        {
            var r = HudMath.Place(HudAnchor.BottomCenter, 30, -40, 200, 100, 1920, 1080);
            Assert.Equal(890, r.X);
            Assert.Equal(940, r.Y);

            var off = HudMath.Place(HudAnchor.BottomRight, 500, 500, 200, 100, 1920, 1080);
            Assert.Equal(1720, off.X);
            Assert.Equal(980, off.Y);
        }

        [Theory]
        [InlineData(5, Elevation.Above)]
        [InlineData(-5, Elevation.Below)]
        [InlineData(2, Elevation.Level)]
        public void ElevationThreshold(float dy, Elevation expected) =>
            Assert.Equal(expected, HudMath.ElevationOf(dy, 3));

        [Theory]
        [InlineData(42.4f, "42m")]
        [InlineData(1250, "1.3km")]
        public void FormatsDistance(float m, string expected) =>
            Assert.Equal(expected, HudMath.FormatDistance(m));
    }
}
