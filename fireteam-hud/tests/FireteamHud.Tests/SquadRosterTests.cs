using System.Linq;
using FireteamHud.Core;
using Xunit;

namespace FireteamHud.Tests
{
    public class SquadRosterTests
    {
        [Fact]
        public void KeepsJoinOrder_AndTracksDeathAndLeaving()
        {
            var roster = new SquadRoster();
            roster.Update(new[]
            {
                new MemberSighting("b", "Bravo", 1, 0, 1, true),
                new MemberSighting("a", "Alpha", 2, 0, 2, true),
            });
            Assert.Equal(new[] { "Bravo", "Alpha" }, roster.Members.Select(m => m.Name));
            Assert.Equal(new[] { 0, 1 }, roster.Members.Select(m => m.JoinIndex));

            roster.Update(new[] { new MemberSighting("a", "Alpha", 5, 0, 5, false) });
            Assert.Equal(MemberStatus.Gone, roster.Members[0].Status);
            Assert.Equal(MemberStatus.Dead, roster.Members[1].Status);
            Assert.Equal(5, roster.Members[1].X);

            // Dead stays dead even once the body stops being reported.
            roster.Update(new MemberSighting[0]);
            Assert.Equal(MemberStatus.Dead, roster.Members[1].Status);
        }

        [Fact]
        public void ReconnectingMemberKeepsSlot()
        {
            var roster = new SquadRoster();
            roster.Update(new[] { new MemberSighting("a", "Alpha", 0, 0, 0, true), new MemberSighting("b", "Bravo", 0, 0, 0, true) });
            roster.Update(new[] { new MemberSighting("b", "Bravo", 0, 0, 0, true) });
            roster.Update(new[] { new MemberSighting("a", "Alpha", 0, 0, 0, true), new MemberSighting("b", "Bravo", 0, 0, 0, true) });
            Assert.Equal(0, roster.Members.Single(m => m.Id == "a").JoinIndex);
            Assert.All(roster.Members, m => Assert.Equal(MemberStatus.Alive, m.Status));
        }

        [Fact]
        public void IgnoresDuplicatesAndBlankIds()
        {
            var roster = new SquadRoster();
            roster.Update(new[]
            {
                new MemberSighting("a", "Alpha", 0, 0, 0, true),
                new MemberSighting("a", "Alpha again", 9, 9, 9, true),
                new MemberSighting("", "Nobody", 0, 0, 0, true),
            });
            Assert.Single(roster.Members);
            Assert.Equal("Alpha", roster.Members[0].Name);
        }

        [Fact]
        public void PaletteStartsWithSthudColoursAndWraps()
        {
            Assert.Equal(Palette.Red, Palette.ForIndex(0));
            Assert.Equal(Palette.Yellow, Palette.ForIndex(3));
            Assert.Equal(Palette.ForIndex(0), Palette.ForIndex(9));
        }
    }
}
