using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace SptStashMcp.Core
{
    /// <summary>
    /// One "put things like X into container Y" rule. All filters that are set must match
    /// (AND); within a list any entry may match (OR). Rules are tried in order, first match wins.
    /// </summary>
    public class SortRule
    {
        public string TargetContainerId { get; set; }
        public List<string> TemplateIds { get; set; } = new List<string>();
        public List<string> ParentTemplateIds { get; set; } = new List<string>();
        public List<string> Kinds { get; set; } = new List<string>();
        public List<string> Calibers { get; set; } = new List<string>();
        public List<string> NameContains { get; set; } = new List<string>();
        /// <summary>Order in which matched items are placed: "name" (default), "caliber", "size", "none".</summary>
        public string SortBy { get; set; } = "name";

        public bool Matches(ItemInfo item)
        {
            if (TemplateIds.Count > 0 && !TemplateIds.Contains(item.TemplateId, StringComparer.OrdinalIgnoreCase)) return false;
            if (ParentTemplateIds.Count > 0 && !item.TemplateParents.Any(p => ParentTemplateIds.Contains(p, StringComparer.OrdinalIgnoreCase))) return false;
            if (Kinds.Count > 0 && !item.Kinds.Any(k => Kinds.Contains(k, StringComparer.OrdinalIgnoreCase))) return false;
            if (Calibers.Count > 0 && (item.Caliber == null || !Calibers.Contains(item.Caliber, StringComparer.OrdinalIgnoreCase))) return false;
            if (NameContains.Count > 0)
            {
                var hay = (item.Name ?? "") + "\n" + (item.ShortName ?? "");
                if (!NameContains.Any(n => hay.IndexOf(n, StringComparison.OrdinalIgnoreCase) >= 0)) return false;
            }
            return true;
        }

        public bool HasAnyFilter =>
            TemplateIds.Count + ParentTemplateIds.Count + Kinds.Count + Calibers.Count + NameContains.Count > 0;

        public static SortRule FromJson(JObject o)
        {
            List<string> L(string key)
            {
                var t = o[key];
                if (t == null || t.Type == JTokenType.Null) return new List<string>();
                if (t.Type == JTokenType.String) return new List<string> { (string)t };
                return t.Values<string>().Where(s => !string.IsNullOrEmpty(s)).ToList();
            }

            var rule = new SortRule
            {
                TargetContainerId = (string)o["targetContainerId"],
                TemplateIds = L("templateIds"),
                ParentTemplateIds = L("parentTemplateIds"),
                Kinds = L("kinds"),
                Calibers = L("calibers"),
                NameContains = L("nameContains"),
                SortBy = (string)o["sortBy"] ?? "name"
            };
            if (string.IsNullOrEmpty(rule.TargetContainerId)) throw new ToolException("Every rule needs targetContainerId.");
            if (!rule.HasAnyFilter) throw new ToolException("Rule for " + rule.TargetContainerId + " has no filters; it would match everything.");
            return rule;
        }
    }

    public class PlannedMove
    {
        public ItemInfo Item { get; set; }
        public int RuleIndex { get; set; }
        public string TargetContainerId { get; set; }
    }

    public class SortPlan
    {
        public List<PlannedMove> Moves { get; } = new List<PlannedMove>();
        public List<string> Warnings { get; } = new List<string>();
    }

    public static class SortPlanner
    {
        /// <summary>
        /// Works out which items should move where. Only items lying directly in one of the
        /// <paramref name="sourceContainerIds"/> grids are considered, so contents of
        /// backpacks and rigs, attachments and loaded ammo are left alone.
        /// </summary>
        public static SortPlan Plan(StashSnapshot snapshot, IList<SortRule> rules, ICollection<string> sourceContainerIds)
        {
            var plan = new SortPlan();
            var containers = snapshot.Containers.ToDictionary(c => c.Id);
            var itemsById = snapshot.Items.ToDictionary(i => i.Id);

            for (int r = 0; r < rules.Count; r++)
            {
                if (!containers.ContainsKey(rules[r].TargetContainerId))
                    plan.Warnings.Add("Rule " + r + ": container " + rules[r].TargetContainerId + " not found in stash; rule skipped.");
            }

            var targetIds = new HashSet<string>(rules.Select(x => x.TargetContainerId));

            foreach (var item in snapshot.Items)
            {
                if (item.Location == null || item.ParentId == null) continue;
                if (!sourceContainerIds.Contains(item.ParentId)) continue;
                if (targetIds.Contains(item.Id)) continue; // never move a sort target itself

                for (int r = 0; r < rules.Count; r++)
                {
                    var rule = rules[r];
                    if (!containers.ContainsKey(rule.TargetContainerId) || !rule.Matches(item)) continue;
                    if (item.ParentId == rule.TargetContainerId) break; // already where it belongs
                    if (IsAncestor(item.Id, rule.TargetContainerId, itemsById, containers))
                    {
                        plan.Warnings.Add(item.Name + " (" + item.Id + ") contains its own target container; skipped.");
                        break;
                    }
                    plan.Moves.Add(new PlannedMove { Item = item, RuleIndex = r, TargetContainerId = rule.TargetContainerId });
                    break;
                }
            }

            var ordered = plan.Moves
                .OrderBy(m => m.RuleIndex)
                .ThenBy(m => SortKey(m.Item, rules[m.RuleIndex].SortBy), StringComparer.OrdinalIgnoreCase)
                .ThenBy(m => m.Item.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
            plan.Moves.Clear();
            plan.Moves.AddRange(ordered);
            return plan;
        }

        static string SortKey(ItemInfo item, string sortBy)
        {
            switch ((sortBy ?? "name").ToLowerInvariant())
            {
                case "caliber": return (item.Caliber ?? "~") + "|" + item.Name;
                // Biggest first packs a grid much better with first-fit placement.
                case "size": return (999 - item.Width * item.Height).ToString("D3") + "|" + item.Name;
                case "none": return "";
                default: return item.Name ?? "";
            }
        }

        /// <summary>True when <paramref name="containerId"/> is <paramref name="itemId"/> or lies somewhere inside it.</summary>
        static bool IsAncestor(string itemId, string containerId,
            Dictionary<string, ItemInfo> items, Dictionary<string, ContainerInfo> containers)
        {
            var current = containerId;
            for (int guard = 0; current != null && guard < 64; guard++)
            {
                if (current == itemId) return true;
                if (containers.TryGetValue(current, out var c)) current = c.ParentId;
                else if (items.TryGetValue(current, out var i)) current = i.ParentId;
                else return false;
            }
            return false;
        }

        /// <summary>Runs a plan one move at a time; the backend picks a free spot for each.</summary>
        public static JObject Execute(IStashBackend backend, SortPlan plan, int maxMoves)
        {
            var done = new JArray();
            var failed = new JArray();
            foreach (var move in plan.Moves.Take(maxMoves))
            {
                var res = backend.Move(move.Item.Id, move.TargetContainerId, null);
                var entry = new JObject
                {
                    ["itemId"] = move.Item.Id,
                    ["name"] = move.Item.Name,
                    ["targetContainerId"] = move.TargetContainerId
                };
                if (res.Success)
                {
                    entry["location"] = StashTools.ToJson(res.Location);
                    done.Add(entry);
                }
                else
                {
                    entry["error"] = res.Error;
                    failed.Add(entry);
                }
            }
            return new JObject
            {
                ["moved"] = done.Count,
                ["failed"] = failed.Count,
                ["skippedOverLimit"] = Math.Max(0, plan.Moves.Count - maxMoves),
                ["warnings"] = new JArray(plan.Warnings),
                ["moves"] = done,
                ["failures"] = failed
            };
        }
    }
}
