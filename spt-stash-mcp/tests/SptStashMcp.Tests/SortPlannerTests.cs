using System.Collections.Generic;
using System.Linq;
using SptStashMcp.Core;
using Xunit;

namespace SptStashMcp.Tests
{
    public class SortPlannerTests
    {
        static readonly HashSet<string> Stash = new HashSet<string> { "stash" };

        [Fact]
        public void FirstMatchingRuleWins_AndItemsAreOrderedByRuleThenName()
        {
            var b = new FakeBackend();
            b.AddContainer("keytool", "stash", 4, 4);
            b.AddContainer("ammo", "stash", 5, 5);
            b.AddItem("k2", "Machinery key", kind: "KeyItemClass");
            b.AddItem("m1", "M855A1", kind: "AmmoItemClass", caliber: "Caliber556x45NATO");
            b.AddItem("k1", "Dorm room 314 key", kind: "KeyItemClass");
            b.AddItem("x", "Bolts");

            var rules = new List<SortRule>
            {
                new SortRule { TargetContainerId = "keytool", Kinds = { "KeyItemClass" } },
                new SortRule { TargetContainerId = "ammo", Kinds = { "AmmoItemClass" }, NameContains = { "key" } },
                new SortRule { TargetContainerId = "ammo", Kinds = { "AmmoItemClass" } },
            };
            var plan = SortPlanner.Plan(b.Snap, rules, Stash);

            Assert.Equal(new[] { "k1", "k2", "m1" }, plan.Moves.Select(m => m.Item.Id));
            Assert.Equal(2, plan.Moves[2].RuleIndex);
        }

        [Fact]
        public void SkipsItemsAlreadyInTarget_NestedItems_AndTargetsThemselves()
        {
            var b = new FakeBackend();
            b.AddContainer("keytool", "stash", 4, 4);
            b.AddContainer("backpack", "stash", 4, 4);
            b.AddItem("in", "Key A", parent: "keytool", kind: "KeyItemClass");
            b.AddItem("nested", "Key B", parent: "backpack", kind: "KeyItemClass");
            var attached = b.AddItem("mod", "Key-shaped scope", kind: "KeyItemClass");
            attached.Location = null; // attached to a weapon, not in a grid

            var rules = new List<SortRule>
            {
                new SortRule { TargetContainerId = "keytool", NameContains = { "key" } },
            };
            Assert.Empty(SortPlanner.Plan(b.Snap, rules, Stash).Moves);
        }

        [Fact]
        public void NeverMovesAContainerIntoItself()
        {
            var b = new FakeBackend();
            b.AddContainer("case", "stash", 4, 4);
            b.AddContainer("inner", "case", 2, 2);
            b.Snap.Items.Single(i => i.Id == "case").Kinds.Add("Box");

            var rules = new List<SortRule> { new SortRule { TargetContainerId = "inner", Kinds = { "Box" } } };
            var plan = SortPlanner.Plan(b.Snap, rules, Stash);
            Assert.Empty(plan.Moves);
            Assert.Single(plan.Warnings);
        }

        [Fact]
        public void UnknownTargetIsAWarning()
        {
            var b = new FakeBackend();
            b.AddItem("k", "Key", kind: "KeyItemClass");
            var plan = SortPlanner.Plan(b.Snap, new List<SortRule> { new SortRule { TargetContainerId = "nope", Kinds = { "KeyItemClass" } } }, Stash);
            Assert.Empty(plan.Moves);
            Assert.Single(plan.Warnings);
        }

        [Fact]
        public void Execute_ReportsFailuresAndRespectsMaxMoves()
        {
            var b = new FakeBackend();
            b.AddContainer("tiny", "stash", 1, 1);
            b.AddItem("a", "Ammo A", kind: "AmmoItemClass");
            b.AddItem("c", "Ammo C", kind: "AmmoItemClass");
            b.AddItem("d", "Ammo D", kind: "AmmoItemClass");

            var plan = SortPlanner.Plan(b.Snap, new List<SortRule> { new SortRule { TargetContainerId = "tiny", Kinds = { "AmmoItemClass" } } }, Stash);
            var res = SortPlanner.Execute(b, plan, 2);

            Assert.Equal(1, (int)res["moved"]);
            Assert.Equal(1, (int)res["failed"]);
            Assert.Equal(1, (int)res["skippedOverLimit"]);
        }

        [Fact]
        public void SortByCaliberGroupsAmmo()
        {
            var b = new FakeBackend();
            b.AddContainer("ammo", "stash", 5, 5);
            b.AddItem("1", "M855", kind: "AmmoItemClass", caliber: "Caliber556x45NATO");
            b.AddItem("2", "BP", kind: "AmmoItemClass", caliber: "Caliber762x39");
            b.AddItem("3", "M995", kind: "AmmoItemClass", caliber: "Caliber556x45NATO");
            var rules = new List<SortRule> { new SortRule { TargetContainerId = "ammo", Kinds = { "AmmoItemClass" }, SortBy = "caliber" } };
            Assert.Equal(new[] { "1", "3", "2" }, SortPlanner.Plan(b.Snap, rules, Stash).Moves.Select(m => m.Item.Id));
        }
    }
}
