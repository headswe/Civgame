using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace SptStashMcp.Core
{
    public class McpTool
    {
        public string Name { get; set; }
        public string Description { get; set; }
        public JObject InputSchema { get; set; }
        /// <summary>Returns any JSON value; it is sent to the client as a text content block.</summary>
        public Func<JObject, JToken> Handler { get; set; }
    }

    /// <summary>Thrown by tool handlers for expected failures (bad arguments, game refused a move).</summary>
    public class ToolException : Exception
    {
        public ToolException(string message) : base(message) { }
    }

    /// <summary>
    /// Transport-independent MCP (JSON-RPC 2.0) handling for a tools-only server.
    /// </summary>
    public class McpProtocol
    {
        public const string LatestProtocolVersion = "2025-06-18";
        static readonly string[] SupportedVersions = { "2025-06-18", "2025-03-26", "2024-11-05" };

        readonly Dictionary<string, McpTool> _tools = new Dictionary<string, McpTool>(StringComparer.Ordinal);
        readonly string _serverName;
        readonly string _serverVersion;
        readonly ILog _log;

        public McpProtocol(string serverName, string serverVersion, ILog log = null)
        {
            _serverName = serverName;
            _serverVersion = serverVersion;
            _log = log ?? new NullLog();
        }

        public IEnumerable<McpTool> Tools => _tools.Values;

        public void AddTool(McpTool tool) => _tools[tool.Name] = tool;

        /// <summary>
        /// Handles one JSON-RPC message or a batch. Returns null when nothing should be sent
        /// back (notifications and responses), which the HTTP layer maps to 202 Accepted.
        /// </summary>
        public JToken Handle(JToken message)
        {
            if (message is JArray batch)
            {
                var responses = new JArray();
                foreach (var m in batch)
                {
                    var r = HandleSingle(m as JObject);
                    if (r != null) responses.Add(r);
                }
                return responses.Count > 0 ? responses : null;
            }
            return HandleSingle(message as JObject);
        }

        JObject HandleSingle(JObject msg)
        {
            if (msg == null) return Error(null, -32600, "Invalid Request");

            var id = msg["id"];
            var method = (string)msg["method"];
            if (method == null) return null; // a response from the client; we never send requests
            if (!msg.ContainsKey("id")) return null; // notification, e.g. notifications/initialized

            try
            {
                var p = msg["params"] as JObject ?? new JObject();
                switch (method)
                {
                    case "initialize": return Result(id, Initialize(p));
                    case "ping": return Result(id, new JObject());
                    case "tools/list": return Result(id, ListTools());
                    case "tools/call": return Result(id, CallTool(p));
                    default: return Error(id, -32601, "Method not found: " + method);
                }
            }
            catch (JsonRpcException e)
            {
                return Error(id, e.Code, e.Message);
            }
            catch (Exception e)
            {
                _log.Error("MCP " + method + " failed: " + e);
                return Error(id, -32603, e.Message);
            }
        }

        JObject Initialize(JObject p)
        {
            var requested = (string)p["protocolVersion"];
            var version = SupportedVersions.Contains(requested) ? requested : LatestProtocolVersion;
            return new JObject
            {
                ["protocolVersion"] = version,
                ["capabilities"] = new JObject { ["tools"] = new JObject { ["listChanged"] = false } },
                ["serverInfo"] = new JObject { ["name"] = _serverName, ["version"] = _serverVersion },
                ["instructions"] =
                    "Tools for reading and reorganising the SPT (Escape from Tarkov) stash. " +
                    "Only works while the player is in the main menu, not in a raid. " +
                    "Call list_containers and list_items before moving anything, and run " +
                    "sort_by_rules with dryRun=true before running it for real."
            };
        }

        JObject ListTools()
        {
            var arr = new JArray();
            foreach (var t in _tools.Values)
            {
                arr.Add(new JObject
                {
                    ["name"] = t.Name,
                    ["description"] = t.Description,
                    ["inputSchema"] = t.InputSchema ?? new JObject { ["type"] = "object" }
                });
            }
            return new JObject { ["tools"] = arr };
        }

        JObject CallTool(JObject p)
        {
            var name = (string)p["name"];
            if (name == null || !_tools.TryGetValue(name, out var tool))
                throw new JsonRpcException(-32602, "Unknown tool: " + name);

            var args = p["arguments"] as JObject ?? new JObject();
            try
            {
                var value = tool.Handler(args);
                return ToolResult(value, false);
            }
            catch (ToolException e)
            {
                return ToolResult(e.Message, true);
            }
            catch (Exception e)
            {
                _log.Error("Tool " + name + " threw: " + e);
                return ToolResult(e.GetType().Name + ": " + e.Message, true);
            }
        }

        static JObject ToolResult(JToken value, bool isError)
        {
            string text = value == null ? "null"
                : value.Type == JTokenType.String ? (string)value
                : value.ToString(Newtonsoft.Json.Formatting.Indented);
            var result = new JObject
            {
                ["content"] = new JArray { new JObject { ["type"] = "text", ["text"] = text } },
                ["isError"] = isError
            };
            if (!isError && value is JObject obj) result["structuredContent"] = obj;
            return result;
        }

        static JObject Result(JToken id, JToken result) =>
            new JObject { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result };

        public static JObject Error(JToken id, int code, string message) =>
            new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = id,
                ["error"] = new JObject { ["code"] = code, ["message"] = message }
            };
    }

    public class JsonRpcException : Exception
    {
        public int Code { get; }
        public JsonRpcException(int code, string message) : base(message) { Code = code; }
    }
}
