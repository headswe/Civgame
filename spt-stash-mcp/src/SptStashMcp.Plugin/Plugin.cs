using System;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using SptStashMcp.Core;

namespace SptStashMcp
{
    [BepInPlugin(Guid, "SPT Stash MCP", Version)]
    public class Plugin : BaseUnityPlugin
    {
        public const string Guid = "com.headswe.sptstashmcp";
        public const string Version = "0.1.0";

        ConfigEntry<int> _port;
        ConfigEntry<string> _token;
        McpHttpServer _server;

        void Awake()
        {
            _port = Config.Bind("Server", "Port", 27150, "Local port for the MCP endpoint (http://127.0.0.1:<port>/mcp).");
            _token = Config.Bind("Server", "BearerToken", "",
                "Optional. When set, clients must send 'Authorization: Bearer <token>'.");

            gameObject.AddComponent<MainThreadDispatcher>();

            var log = new BepInExLog(Logger);
            var mcp = new McpProtocol("spt-stash", Version, log);
            StashTools.Register(mcp, new EftStashBackend(log));

            try
            {
                _server = new McpHttpServer(mcp, _port.Value, _token.Value, "/mcp", log);
                _server.Start();
                Logger.LogInfo("MCP endpoint listening on http://127.0.0.1:" + _port.Value + "/mcp");
            }
            catch (Exception e)
            {
                Logger.LogError("Could not start MCP endpoint on port " + _port.Value + ": " + e.Message);
            }
        }

        void OnDestroy() => _server?.Dispose();

        class BepInExLog : ILog
        {
            readonly ManualLogSource _src;
            public BepInExLog(ManualLogSource src) { _src = src; }
            public void Info(string message) => _src.LogInfo(message);
            public void Warn(string message) => _src.LogWarning(message);
            public void Error(string message) => _src.LogError(message);
        }
    }
}
