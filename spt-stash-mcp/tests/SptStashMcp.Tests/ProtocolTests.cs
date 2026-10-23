using System.Linq;
using Newtonsoft.Json.Linq;
using SptStashMcp.Core;
using Xunit;

namespace SptStashMcp.Tests
{
    public class ProtocolTests
    {
        static (McpProtocol mcp, FakeBackend backend) Create()
        {
            var backend = new FakeBackend();
            var mcp = new McpProtocol("spt-stash", "test");
            StashTools.Register(mcp, backend);
            return (mcp, backend);
        }

        static JObject Call(McpProtocol mcp, string method, JObject p = null, int id = 1) =>
            (JObject)mcp.Handle(new JObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = p ?? new JObject() });

        static JObject Tool(McpProtocol mcp, string name, JObject args) =>
            (JObject)Call(mcp, "tools/call", new JObject { ["name"] = name, ["arguments"] = args })["result"];

        [Fact]
        public void Initialize_NegotiatesVersionAndAdvertisesTools()
        {
            var (mcp, _) = Create();
            var res = Call(mcp, "initialize", new JObject { ["protocolVersion"] = "2025-03-26" })["result"];
            Assert.Equal("2025-03-26", (string)res["protocolVersion"]);
            Assert.NotNull(res["capabilities"]["tools"]);

            var unknown = Call(mcp, "initialize", new JObject { ["protocolVersion"] = "1999-01-01" })["result"];
            Assert.Equal(McpProtocol.LatestProtocolVersion, (string)unknown["protocolVersion"]);
        }

        [Fact]
        public void Notifications_GetNoResponse()
        {
            var (mcp, _) = Create();
            Assert.Null(mcp.Handle(new JObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" }));
        }

        [Fact]
        public void ToolsList_ContainsAllTools()
        {
            var (mcp, _) = Create();
            var names = Call(mcp, "tools/list")["result"]["tools"].Select(t => (string)t["name"]).ToList();
            Assert.Equal(new[] { "get_status", "list_containers", "list_items", "move_item", "sort_by_rules" }, names);
        }

        [Fact]
        public void UnknownMethod_IsJsonRpcError()
        {
            var (mcp, _) = Create();
            Assert.Equal(-32601, (int)Call(mcp, "resources/list")["error"]["code"]);
        }

        [Fact]
        public void NotReady_IsToolError()
        {
            var (mcp, backend) = Create();
            backend.NotReady = "in raid";
            var res = Tool(mcp, "list_items", new JObject());
            Assert.True((bool)res["isError"]);
            Assert.Contains("in raid", (string)res["content"][0]["text"]);
        }

        [Fact]
        public void ListItems_DefaultsToDirectStashChildren()
        {
            var (mcp, backend) = Create();
            backend.AddContainer("case", "stash", 5, 5);
            backend.AddItem("a", "Salewa");
            backend.AddItem("b", "Grizzly", parent: "case");
            var res = (JObject)Tool(mcp, "list_items", new JObject())["structuredContent"];
            var ids = res["items"].Select(i => (string)i["id"]).ToList();
            Assert.Equal(new[] { "case", "a" }, ids);

            var rec = (JObject)Tool(mcp, "list_items", new JObject { ["recursive"] = true })["structuredContent"];
            Assert.Equal(3, (int)rec["total"]);
        }

        [Fact]
        public void MoveItem_RequiresBothCoordinates()
        {
            var (mcp, backend) = Create();
            backend.AddContainer("case", "stash", 5, 5);
            backend.AddItem("a", "Salewa");
            var res = Tool(mcp, "move_item", new JObject { ["itemId"] = "a", ["containerId"] = "case", ["x"] = 1 });
            Assert.True((bool)res["isError"]);

            var ok = Tool(mcp, "move_item", new JObject { ["itemId"] = "a", ["containerId"] = "case" });
            Assert.False((bool)ok["isError"]);
            Assert.Equal("case", backend.Snap.Items.Single(i => i.Id == "a").ParentId);
        }

        [Fact]
        public void SortByRules_DryRunDoesNotMove()
        {
            var (mcp, backend) = Create();
            backend.AddContainer("keytool", "stash", 4, 4);
            backend.AddItem("k1", "Dorm room 314 key", kind: "KeyItemClass");
            var res = (JObject)Tool(mcp, "sort_by_rules", new JObject
            {
                ["rules"] = new JArray(new JObject { ["targetContainerId"] = "keytool", ["kinds"] = new JArray("KeyItemClass") })
            })["structuredContent"];
            Assert.Equal(1, (int)res["plannedMoves"]);
            Assert.Empty(backend.Moves);
        }

        [Fact]
        public void SortByRules_RejectsRuleWithoutFilters()
        {
            var (mcp, _) = Create();
            var res = Tool(mcp, "sort_by_rules", new JObject
            {
                ["rules"] = new JArray(new JObject { ["targetContainerId"] = "stash" })
            });
            Assert.True((bool)res["isError"]);
        }
    }
}
