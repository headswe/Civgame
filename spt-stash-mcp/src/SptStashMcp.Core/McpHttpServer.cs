using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SptStashMcp.Core
{
    /// <summary>
    /// Minimal MCP "Streamable HTTP" transport: every POST carries one JSON-RPC message
    /// (or batch) and gets a plain application/json response. No SSE streams, no sessions,
    /// which the spec allows for servers that never push to the client.
    /// Binds to loopback only.
    /// </summary>
    public class McpHttpServer : IDisposable
    {
        readonly McpProtocol _protocol;
        readonly ILog _log;
        readonly string _path;
        readonly string _token;
        readonly HttpListener _listener = new HttpListener();
        Thread _thread;
        volatile bool _running;

        public McpHttpServer(McpProtocol protocol, int port, string token = null, string path = "/mcp", ILog log = null)
        {
            _protocol = protocol;
            _log = log ?? new NullLog();
            _path = path.TrimEnd('/');
            _token = string.IsNullOrEmpty(token) ? null : token;
            _listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
            _listener.Prefixes.Add("http://localhost:" + port + "/");
        }

        public void Start()
        {
            _listener.Start();
            _running = true;
            _thread = new Thread(Loop) { IsBackground = true, Name = "SptStashMcp HTTP" };
            _thread.Start();
        }

        void Loop()
        {
            while (_running)
            {
                HttpListenerContext ctx;
                try { ctx = _listener.GetContext(); }
                catch (Exception) when (!_running) { return; }
                catch (Exception e) { _log.Warn("HTTP accept failed: " + e.Message); continue; }

                // Game work is serialised on the Unity main thread, so concurrent requests are safe.
                ThreadPool.QueueUserWorkItem(_ => Serve(ctx));
            }
        }

        void Serve(HttpListenerContext ctx)
        {
            var req = ctx.Request;
            var res = ctx.Response;
            try
            {
                if (req.Url.AbsolutePath.TrimEnd('/') != _path) { Send(res, 404, null); return; }

                // DNS-rebinding protection: browsers send Origin, MCP clients normally do not.
                var origin = req.Headers["Origin"];
                if (!string.IsNullOrEmpty(origin) && !IsLoopbackOrigin(origin)) { Send(res, 403, null); return; }

                if (_token != null && req.Headers["Authorization"] != "Bearer " + _token)
                {
                    Send(res, 401, null);
                    return;
                }

                if (req.HttpMethod == "GET") { Send(res, 405, null); return; } // no server-initiated stream
                if (req.HttpMethod == "DELETE") { Send(res, 405, null); return; } // stateless, no sessions
                if (req.HttpMethod != "POST") { Send(res, 405, null); return; }

                string body;
                using (var reader = new StreamReader(req.InputStream, Encoding.UTF8)) body = reader.ReadToEnd();

                JToken message;
                try { message = JToken.Parse(body); }
                catch (JsonException)
                {
                    Send(res, 400, McpProtocol.Error(null, -32700, "Parse error"));
                    return;
                }

                var response = _protocol.Handle(message);
                if (response == null) Send(res, 202, null);
                else Send(res, 200, response);
            }
            catch (Exception e)
            {
                _log.Error("HTTP request failed: " + e);
                try { Send(res, 500, null); } catch { /* connection already gone */ }
            }
        }

        static bool IsLoopbackOrigin(string origin)
        {
            return Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                && (uri.Host == "localhost" || uri.Host == "127.0.0.1" || uri.Host == "[::1]");
        }

        static void Send(HttpListenerResponse res, int status, JToken json)
        {
            res.StatusCode = status;
            if (json != null)
            {
                var bytes = Encoding.UTF8.GetBytes(json.ToString(Formatting.None));
                res.ContentType = "application/json";
                res.ContentLength64 = bytes.Length;
                res.OutputStream.Write(bytes, 0, bytes.Length);
            }
            res.OutputStream.Close();
        }

        public void Dispose()
        {
            _running = false;
            try { _listener.Stop(); _listener.Close(); } catch { /* shutting down */ }
        }
    }
}
