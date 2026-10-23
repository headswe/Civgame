using System.Collections.Generic;
using System.Linq;
using SptStashMcp.Core;

namespace SptStashMcp.Tests
{
    /// <summary>In-memory stash with first-fit placement, standing in for the game.</summary>
    class FakeBackend : IStashBackend
    {
        public StashSnapshot Snap = new StashSnapshot { StashId = "stash" };
        public string NotReady;
        public List<(string item, string container)> Moves = new List<(string, string)>();

        public FakeBackend()
        {
            AddContainer("stash", null, 10, 10);
        }

        public ContainerInfo AddContainer(string id, string parent, int w, int h, int x = 0, int y = 0)
        {
            var c = new ContainerInfo { Id = id, Name = id, ParentId = parent };
            c.Grids.Add(new GridInfo { Index = 0, Id = "main", Width = w, Height = h });
            Snap.Containers.Add(c);
            if (parent != null)
                Snap.Items.Add(new ItemInfo { Id = id, Name = id, ParentId = parent, Width = 1, Height = 1, IsContainer = true,
                    Location = new GridLocation { X = x, Y = y } });
            return c;
        }

        public ItemInfo AddItem(string id, string name, string parent = "stash", string kind = "Item", string caliber = null,
            string templateParent = null)
        {
            var item = new ItemInfo
            {
                Id = id, Name = name, ShortName = name, ParentId = parent, Width = 1, Height = 1, Caliber = caliber,
                TemplateId = "tpl_" + name, Kinds = new List<string> { kind, "Item" },
                Location = new GridLocation { X = Snap.Items.Count, Y = 9 }
            };
            if (templateParent != null) item.TemplateParents.Add(templateParent);
            Snap.Items.Add(item);
            return item;
        }

        public string NotReadyReason() => NotReady;
        public StashSnapshot GetSnapshot() => Snap;

        public MoveResult Move(string itemId, string containerId, GridLocation location)
        {
            var item = Snap.Items.FirstOrDefault(i => i.Id == itemId);
            var container = Snap.Containers.FirstOrDefault(c => c.Id == containerId);
            if (item == null || container == null) return MoveResult.Fail("not found");
            var grid = container.Grids[0];
            int used = Snap.Items.Count(i => i.ParentId == containerId);
            if (used >= grid.Width * grid.Height) return MoveResult.Fail("no space");
            var loc = location ?? new GridLocation { X = used % grid.Width, Y = used / grid.Width };
            item.ParentId = containerId;
            item.Location = loc;
            Moves.Add((itemId, containerId));
            return new MoveResult { Success = true, ContainerId = containerId, Location = loc };
        }
    }
}
