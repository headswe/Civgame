using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace SptStashMcp.Core
{
    /// <summary>Registers the stash tools on an <see cref="McpProtocol"/>.</summary>
    public static class StashTools
    {
        public static readonly JsonSerializer Json = JsonSerializer.Create(new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore
        });

        public static JToken ToJson(object o) => o == null ? JValue.CreateNull() : JToken.FromObject(o, Json);

        public static void Register(McpProtocol mcp, IStashBackend backend)
        {
            mcp.AddTool(new McpTool
            {
                Name = "get_status",
                Description = "Reports whether the stash can be read and changed right now (main menu, profile loaded, not in a raid).",
                InputSchema = Schema(new JObject()),
                Handler = _ =>
                {
                    var reason = backend.NotReadyReason();
                    return new JObject { ["ready"] = reason == null, ["reason"] = reason };
                }
            });

            mcp.AddTool(new McpTool
            {
                Name = "list_containers",
                Description = "Lists the stash and every container inside it (cases, backpacks, rigs, keytools...) with their grids, sizes and free cells. Use the ids as targets for move_item and sort_by_rules.",
                InputSchema = Schema(new JObject()),
                Handler = _ =>
                {
                    var snap = Snapshot(backend);
                    return new JObject { ["stashId"] = snap.StashId, ["containers"] = ToJson(snap.Containers) };
                }
            });

            mcp.AddTool(new McpTool
            {
                Name = "list_items",
                Description = "Lists items in a container (the stash by default). Each item has id, templateId, name, size, grid location, kinds (class hierarchy, e.g. KeyItemClass, AmmoItemClass), templateParents (category ids) and caliber for ammo.",
                InputSchema = Schema(new JObject
                {
                    ["containerId"] = Prop("string", "Container to list. Defaults to the stash root."),
                    ["recursive"] = Prop("boolean", "Also list items inside nested containers, attachments and magazines. Default false."),
                    ["query"] = Prop("string", "Optional case-insensitive filter on name/short name."),
                    ["limit"] = Prop("integer", "Max items to return. Default 500.")
                }),
                Handler = args =>
                {
                    var snap = Snapshot(backend);
                    var containerId = (string)args["containerId"] ?? snap.StashId;
                    bool recursive = (bool?)args["recursive"] ?? false;
                    var query = (string)args["query"];
                    int limit = (int?)args["limit"] ?? 500;

                    if (!snap.Containers.Any(c => c.Id == containerId) && !snap.Items.Any(i => i.Id == containerId))
                        throw new ToolException("Unknown container id " + containerId);

                    IEnumerable<ItemInfo> items = recursive
                        ? Descendants(snap, containerId)
                        : snap.Items.Where(i => i.ParentId == containerId);
                    if (!string.IsNullOrEmpty(query))
                        items = items.Where(i =>
                            (i.Name ?? "").IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
                            (i.ShortName ?? "").IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0);

                    var list = items.ToList();
                    return new JObject
                    {
                        ["containerId"] = containerId,
                        ["total"] = list.Count,
                        ["truncated"] = list.Count > limit,
                        ["items"] = ToJson(list.Take(limit).ToList())
                    };
                }
            });

            mcp.AddTool(new McpTool
            {
                Name = "move_item",
                Description = "Moves one item into a container grid through the game's own inventory controller, so the server profile stays consistent. Omit x/y to let the game pick the first free spot.",
                InputSchema = Schema(new JObject
                {
                    ["itemId"] = Prop("string", "Id of the item to move."),
                    ["containerId"] = Prop("string", "Id of the target container (from list_containers)."),
                    ["gridIndex"] = Prop("integer", "Grid within the container. Default 0."),
                    ["x"] = Prop("integer", "Column of the item's top-left cell."),
                    ["y"] = Prop("integer", "Row of the item's top-left cell."),
                    ["rotated"] = Prop("boolean", "Place the item rotated 90 degrees. Default false.")
                }, "itemId", "containerId"),
                Handler = args =>
                {
                    EnsureReady(backend);
                    var itemId = Required(args, "itemId");
                    var containerId = Required(args, "containerId");
                    GridLocation loc = null;
                    if (args["x"] != null || args["y"] != null)
                    {
                        if (args["x"] == null || args["y"] == null) throw new ToolException("Give both x and y, or neither.");
                        loc = new GridLocation
                        {
                            GridIndex = (int?)args["gridIndex"] ?? 0,
                            X = (int)args["x"],
                            Y = (int)args["y"],
                            Rotated = (bool?)args["rotated"] ?? false
                        };
                    }
                    var res = backend.Move(itemId, containerId, loc);
                    if (!res.Success) throw new ToolException("Move failed: " + res.Error);
                    return ToJson(res);
                }
            });

            mcp.AddTool(new McpTool
            {
                Name = "sort_by_rules",
                Description =
                    "Sorts loose items into containers by rules, e.g. all keys into the keytool and ammo into an ammo case. " +
                    "Rules are tried in order and the first matching rule wins; filters inside a rule are ANDed, entries in a list are ORed. " +
                    "Only items lying directly in the source containers (the stash root by default) are moved. " +
                    "dryRun defaults to true and only returns the plan.",
                InputSchema = Schema(new JObject
                {
                    ["rules"] = new JObject
                    {
                        ["type"] = "array",
                        ["items"] = Schema(new JObject
                        {
                            ["targetContainerId"] = Prop("string", "Container that matching items go into."),
                            ["templateIds"] = StringList("Exact item template ids."),
                            ["parentTemplateIds"] = StringList("Template category ids anywhere in the item's templateParents, e.g. 5485a8684bdc2da71d8b4567 for ammo, 5c99f98d86f7745c314214b3 for mechanical keys, 5c164d2286f774194c5e69fa for keycards."),
                            ["kinds"] = StringList("Class names from the item's kinds list, e.g. KeyItemClass, AmmoItemClass."),
                            ["calibers"] = StringList("Ammo calibers as reported in list_items, e.g. Caliber556x45NATO."),
                            ["nameContains"] = StringList("Substrings of the item name or short name."),
                            ["sortBy"] = new JObject
                            {
                                ["type"] = "string",
                                ["enum"] = new JArray("name", "caliber", "size", "none"),
                                ["description"] = "Placement order of matched items. Default name."
                            }
                        }, "targetContainerId")
                    },
                    ["sourceContainerIds"] = StringList("Containers to pull loose items from. Default: the stash root."),
                    ["dryRun"] = Prop("boolean", "Only return the plan. Default true."),
                    ["maxMoves"] = Prop("integer", "Stop after this many moves. Default 200.")
                }, "rules"),
                Handler = args =>
                {
                    var rulesJson = args["rules"] as JArray;
                    if (rulesJson == null || rulesJson.Count == 0) throw new ToolException("rules must be a non-empty array.");
                    var rules = rulesJson.Select(r => SortRule.FromJson(r as JObject ?? throw new ToolException("Each rule must be an object."))).ToList();

                    var snap = Snapshot(backend);
                    var sources = args["sourceContainerIds"] is JArray s && s.Count > 0
                        ? new HashSet<string>(s.Values<string>())
                        : new HashSet<string> { snap.StashId };
                    bool dryRun = (bool?)args["dryRun"] ?? true;
                    int maxMoves = (int?)args["maxMoves"] ?? 200;

                    var plan = SortPlanner.Plan(snap, rules, sources);
                    if (dryRun)
                    {
                        return new JObject
                        {
                            ["dryRun"] = true,
                            ["plannedMoves"] = plan.Moves.Count,
                            ["warnings"] = new JArray(plan.Warnings),
                            ["moves"] = new JArray(plan.Moves.Select(m => new JObject
                            {
                                ["itemId"] = m.Item.Id,
                                ["name"] = m.Item.Name,
                                ["rule"] = m.RuleIndex,
                                ["targetContainerId"] = m.TargetContainerId
                            }))
                        };
                    }
                    EnsureReady(backend);
                    return SortPlanner.Execute(backend, plan, maxMoves);
                }
            });
        }

        static StashSnapshot Snapshot(IStashBackend backend)
        {
            EnsureReady(backend);
            return backend.GetSnapshot();
        }

        static void EnsureReady(IStashBackend backend)
        {
            var reason = backend.NotReadyReason();
            if (reason != null) throw new ToolException("Stash not available: " + reason);
        }

        static IEnumerable<ItemInfo> Descendants(StashSnapshot snap, string rootId)
        {
            var byParent = snap.Items.Where(i => i.ParentId != null).ToLookup(i => i.ParentId);
            var stack = new Stack<string>();
            stack.Push(rootId);
            while (stack.Count > 0)
            {
                foreach (var child in byParent[stack.Pop()])
                {
                    yield return child;
                    stack.Push(child.Id);
                }
            }
        }

        static string Required(JObject args, string key)
        {
            var v = (string)args[key];
            if (string.IsNullOrEmpty(v)) throw new ToolException(key + " is required.");
            return v;
        }

        static JObject Schema(JObject properties, params string[] required)
        {
            var o = new JObject { ["type"] = "object", ["properties"] = properties };
            if (required.Length > 0) o["required"] = new JArray(required);
            return o;
        }

        static JObject Prop(string type, string description) =>
            new JObject { ["type"] = type, ["description"] = description };

        static JObject StringList(string description) =>
            new JObject { ["type"] = "array", ["items"] = new JObject { ["type"] = "string" }, ["description"] = description };
    }
}
