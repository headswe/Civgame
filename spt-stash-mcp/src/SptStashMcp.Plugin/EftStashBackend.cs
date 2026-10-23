using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using Comfort.Common;
using EFT;
using EFT.InventoryLogic;
using EFT.UI;
using SptStashMcp.Core;

namespace SptStashMcp
{
    /// <summary>
    /// Reads and moves stash items through the client's own InventoryController, so every
    /// move goes to the SPT server as a normal inventory operation.
    ///
    /// Everything that depends on EFT's (SPT-remapped) Assembly-CSharp lives in this file.
    /// Strongly typed calls are used where the remapped names have been stable across SPT
    /// releases (Item, CompoundItem, InventoryController, InteractionsHandlerClass,
    /// LocationInGrid). Members that are obfuscated or have moved between versions are read
    /// by reflection with a fallback, so a game update degrades a field instead of breaking
    /// the build. If an SPT update renames one of the typed members, fix it here.
    /// </summary>
    public class EftStashBackend : IStashBackend
    {
        const BindingFlags AnyInstance = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        const int TransactionTimeoutMs = 15000;

        readonly ILog _log;
        FieldInfo _controllerField;

        public EftStashBackend(ILog log) { _log = log; }

        public string NotReadyReason() => MainThreadDispatcher.Run(ReadyCheck);

        string ReadyCheck()
        {
            // Fika raids (and the 3D hideout) run in a GameWorld; inventory there is synced
            // by Fika/the raid code, so stay out and only work from the menus.
            if (Singleton<GameWorld>.Instantiated) return "a raid or the hideout is loaded; go back to the main menu";
            var controller = FindController();
            if (controller == null) return "profile not loaded yet (open the main menu or the character screen once)";
            if (controller.Inventory?.Stash == null) return "no stash on the loaded profile";
            return null;
        }

        public StashSnapshot GetSnapshot() => MainThreadDispatcher.Run(() =>
        {
            var reason = ReadyCheck();
            if (reason != null) throw new ToolException("Stash not available: " + reason);
            return BuildSnapshot(FindController().Inventory.Stash);
        });

        public MoveResult Move(string itemId, string containerId, GridLocation location)
        {
            // Phase 1 on the main thread: validate and submit. Phase 2 here: wait for the
            // server's answer, which arrives later through the callback on the main thread.
            MoveResult outcome = null;
            var serverDone = new ManualResetEvent(false);

            var submitted = MainThreadDispatcher.Run(() =>
            {
                var reason = ReadyCheck();
                if (reason != null) return MoveResult.Fail(reason);

                var controller = FindController();
                var stash = controller.Inventory.Stash;
                var all = stash.GetAllItems().ToList();
                var item = all.FirstOrDefault(i => i.Id.ToString() == itemId);
                if (item == null) return MoveResult.Fail("item " + itemId + " is not in the stash");
                if (item == stash) return MoveResult.Fail("the stash itself cannot be moved");
                var target = all.FirstOrDefault(i => i.Id.ToString() == containerId) as CompoundItem;
                if (target == null || target.Grids == null || target.Grids.Length == 0)
                    return MoveResult.Fail("container " + containerId + " not found or has no grids");

                ItemAddress address = null;
                GridLocation placed = null;
                if (location == null)
                {
                    for (int g = 0; g < target.Grids.Length && address == null; g++)
                    {
                        var free = target.Grids[g].FindFreeSpace(item);
                        if (free == null) continue;
                        address = target.Grids[g].CreateItemAddress(free);
                        placed = ToGridLocation(g, free);
                    }
                    if (address == null) return MoveResult.Fail("no free space for the item in " + containerId);
                }
                else
                {
                    if (location.GridIndex < 0 || location.GridIndex >= target.Grids.Length)
                        return MoveResult.Fail("container has " + target.Grids.Length + " grid(s); gridIndex " + location.GridIndex + " is out of range");
                    var loc = new LocationInGrid(location.X, location.Y,
                        location.Rotated ? ItemRotation.Vertical : ItemRotation.Horizontal);
                    address = target.Grids[location.GridIndex].CreateItemAddress(loc);
                    placed = location;
                }

                // simulate: true builds the operation without applying it; running it as a
                // network transaction applies it locally and sends it to the server.
                var op = InteractionsHandlerClass.Move(item, address, controller, true);
                if (op.Failed) return MoveResult.Fail(op.Error?.ToString() ?? "the game rejected the move");

                controller.TryRunNetworkTransaction(op, result =>
                {
                    outcome = result.Succeed
                        ? new MoveResult { Success = true, ContainerId = containerId, Location = placed }
                        : MoveResult.Fail("server rejected the move: " + result.Error);
                    serverDone.Set();
                });
                return new MoveResult { Success = true, ContainerId = containerId, Location = placed };
            });

            if (!submitted.Success) return submitted;
            if (!serverDone.WaitOne(TransactionTimeoutMs))
                return MoveResult.Fail("timed out waiting for the server to confirm the move; check the stash before retrying");
            return outcome;
        }

        // ---- reading --------------------------------------------------------------------

        StashSnapshot BuildSnapshot(CompoundItem stash)
        {
            var snap = new StashSnapshot { StashId = stash.Id.ToString() };
            var containerById = new Dictionary<string, ContainerInfo>();

            foreach (var item in stash.GetAllItems())
            {
                var id = item.Id.ToString();
                string parentId = null;
                try { parentId = item.Parent?.Container?.ParentItem?.Id.ToString(); }
                catch (Exception) { /* detached item */ }

                if (item is CompoundItem compound && compound.Grids != null && compound.Grids.Length > 0)
                {
                    var c = new ContainerInfo
                    {
                        Id = id,
                        Name = SafeName(item),
                        TemplateId = item.TemplateId.ToString(),
                        ParentId = item == stash ? null : parentId
                    };
                    for (int g = 0; g < compound.Grids.Length; g++)
                    {
                        var grid = compound.Grids[g];
                        c.Grids.Add(new GridInfo
                        {
                            Index = g,
                            Id = grid.ID,
                            Width = ReadInt(grid, "GridWidth"),
                            Height = ReadInt(grid, "GridHeight")
                        });
                    }
                    snap.Containers.Add(c);
                    containerById[id] = c;
                }

                if (item == stash) continue;

                var size = item.CalculateCellSize();
                var info = new ItemInfo
                {
                    Id = id,
                    TemplateId = item.TemplateId.ToString(),
                    Name = SafeName(item),
                    ShortName = SafeShortName(item),
                    ParentId = parentId,
                    Location = ReadGridLocation(item),
                    Width = size.X,
                    Height = size.Y,
                    StackCount = item.StackObjectsCount,
                    Kinds = TypeChain(item.GetType()),
                    TemplateParents = TemplateParents(item),
                    Caliber = ReadString(item, "Caliber") ?? ReadString(item.Template, "Caliber"),
                    IsContainer = containerById.ContainsKey(id)
                };
                if (info.Location != null && info.Location.Rotated)
                {
                    // CalculateCellSize reports the unrotated footprint.
                    var w = info.Width; info.Width = info.Height; info.Height = w;
                }
                snap.Items.Add(info);
            }

            foreach (var c in snap.Containers)
            {
                foreach (var g in c.Grids)
                {
                    int used = snap.Items
                        .Where(i => i.ParentId == c.Id && i.Location != null && i.Location.GridIndex == g.Index)
                        .Sum(i => i.Width * i.Height);
                    g.FreeCells = Math.Max(0, g.Width * g.Height - used);
                }
            }
            return snap;
        }

        static GridLocation ReadGridLocation(Item item)
        {
            var address = item.Parent;
            if (address == null) return null;
            // Grid addresses expose LocationInGrid and Grid; slot and cartridge addresses don't.
            var loc = ReadMember(address, "LocationInGrid") as LocationInGrid;
            if (loc == null) return null;
            var grid = ReadMember(address, "Grid");
            int index = 0;
            if (address.Container?.ParentItem is CompoundItem parent && parent.Grids != null)
                index = Math.Max(0, Array.IndexOf(parent.Grids, grid));
            return ToGridLocation(index, loc);
        }

        static GridLocation ToGridLocation(int gridIndex, LocationInGrid loc) => new GridLocation
        {
            GridIndex = gridIndex,
            X = loc.x,
            Y = loc.y,
            Rotated = loc.r == ItemRotation.Vertical
        };

        static string SafeName(Item item)
        {
            try { return item.Name.Localized(); } catch (Exception) { return item.Name; }
        }

        static string SafeShortName(Item item)
        {
            try { return item.ShortName.Localized(); } catch (Exception) { return item.ShortName; }
        }

        static List<string> TypeChain(Type t)
        {
            var list = new List<string>();
            for (; t != null && t != typeof(object); t = t.BaseType) list.Add(t.Name);
            return list;
        }

        /// <summary>Template category ids, nearest first, e.g. a key → mechanical key → key → item.</summary>
        static List<string> TemplateParents(Item item)
        {
            var result = new List<string>();
            object template = item.Template;
            IDictionary templates = null;
            for (int guard = 0; template != null && guard < 16; guard++)
            {
                // Newer clients link the parent template object; older ones only store its id.
                var parent = ReadMember(template, "Parent");
                var parentId = ReadString(template, "_parent") ?? ReadString(parent, "_id");
                if (string.IsNullOrEmpty(parentId)) break;
                result.Add(parentId);

                if (parent == null)
                {
                    templates = templates ?? ItemTemplates();
                    parent = templates != null && templates.Contains(parentId) ? templates[parentId] : null;
                }
                template = parent;
            }
            return result;
        }

        static IDictionary ItemTemplates()
        {
            try
            {
                // Singleton<ItemFactoryClass>.Instance.ItemTemplates, looked up by name because
                // the factory class has been renamed between SPT versions.
                var factoryType = typeof(Item).Assembly.GetTypes().FirstOrDefault(t => t.Name == "ItemFactoryClass");
                if (factoryType == null) return null;
                var singleton = typeof(Singleton<>).MakeGenericType(factoryType);
                var instance = singleton.GetProperty("Instance", BindingFlags.Static | BindingFlags.Public)?.GetValue(null);
                return ReadMember(instance, "ItemTemplates") as IDictionary;
            }
            catch (Exception) { return null; }
        }

        // ---- controller -----------------------------------------------------------------

        /// <summary>
        /// The menu's ItemUiContext keeps the player's InventoryController in an obfuscated
        /// field; find it by type instead of by name.
        /// </summary>
        InventoryController FindController()
        {
            var ctx = ItemUiContext.Instance;
            if (ctx == null) return null;
            if (_controllerField == null)
            {
                _controllerField = typeof(ItemUiContext).GetFields(AnyInstance)
                    .FirstOrDefault(f => typeof(InventoryController).IsAssignableFrom(f.FieldType));
                if (_controllerField == null)
                {
                    _log.Error("No InventoryController field on ItemUiContext; this SPT version is not supported yet.");
                    return null;
                }
            }
            return _controllerField.GetValue(ctx) as InventoryController;
        }

        // ---- reflection helpers ---------------------------------------------------------

        static object ReadMember(object obj, string name)
        {
            if (obj == null) return null;
            var t = obj.GetType();
            var p = t.GetProperty(name, AnyInstance);
            if (p != null && p.GetIndexParameters().Length == 0) return p.GetValue(obj);
            return t.GetField(name, AnyInstance)?.GetValue(obj);
        }

        static string ReadString(object obj, string name)
        {
            var v = ReadMember(obj, name);
            return v == null ? null : v.ToString();
        }

        /// <summary>Reads an int that is either plain or wrapped in a bindable with a Value member.</summary>
        static int ReadInt(object obj, string name)
        {
            var v = ReadMember(obj, name);
            if (v is int i) return i;
            if (v != null && ReadMember(v, "Value") is int j) return j;
            return 0;
        }
    }
}
