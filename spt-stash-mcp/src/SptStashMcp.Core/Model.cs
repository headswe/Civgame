using System.Collections.Generic;

namespace SptStashMcp.Core
{
    /// <summary>A grid inside a container (a stash or a case usually has one, a rig can have several).</summary>
    public class GridInfo
    {
        public int Index { get; set; }
        public string Id { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int FreeCells { get; set; }
    }

    /// <summary>Any item with at least one grid: the stash itself, cases, backpacks, rigs.</summary>
    public class ContainerInfo
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string TemplateId { get; set; }
        /// <summary>Id of the container this one sits in; null for the stash root.</summary>
        public string ParentId { get; set; }
        public List<GridInfo> Grids { get; set; } = new List<GridInfo>();
    }

    public class GridLocation
    {
        public int GridIndex { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public bool Rotated { get; set; }
    }

    public class ItemInfo
    {
        public string Id { get; set; }
        public string TemplateId { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        /// <summary>Id of the item this one is attached to or stored in.</summary>
        public string ParentId { get; set; }
        /// <summary>Set only when the item sits in a grid. Null for weapon mods, ammo in magazines etc.</summary>
        public GridLocation Location { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int StackCount { get; set; }
        /// <summary>The item's class name followed by its base class names, e.g. KeyItemClass, Item.</summary>
        public List<string> Kinds { get; set; } = new List<string>();
        /// <summary>Template ancestry, nearest parent first (e.g. ammo → "5485a8684bdc2da71d8b4567").</summary>
        public List<string> TemplateParents { get; set; } = new List<string>();
        public string Caliber { get; set; }
        public bool IsContainer { get; set; }
    }

    public class StashSnapshot
    {
        public string StashId { get; set; }
        public List<ContainerInfo> Containers { get; set; } = new List<ContainerInfo>();
        public List<ItemInfo> Items { get; set; } = new List<ItemInfo>();
    }

    public class MoveResult
    {
        public bool Success { get; set; }
        public string Error { get; set; }
        public string ContainerId { get; set; }
        public GridLocation Location { get; set; }

        public static MoveResult Fail(string error) => new MoveResult { Success = false, Error = error };
    }
}
