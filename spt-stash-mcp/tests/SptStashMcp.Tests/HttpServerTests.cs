using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using SptStashMcp.Core;
using Xunit;

namespace SptStashMcp.Tests
{
    public class HttpServerTests
    {
        static int FreePort()
        {
            var l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        static McpHttpServer Start(int port, string token = null)
        {
            var mcp = new McpProtocol("spt-stash", "test");
            StashTools.Register(mcp, new FakeBackend());
            var server = new McpHttpServer(mcp, port, token);
            server.Start();
            return server;
        }

        static HttpRequestMessage Post(int port, string body) =>
            new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:{port}/mcp")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };

        [Fact]
        public async Task InitializeAndCallTool_OverHttp()
        {
            int port = FreePort();
            using var server = Start(port);
            using var http = new HttpClient();

            var init = await http.SendAsync(Post(port, "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\"}}"));
            Assert.Equal(HttpStatusCode.OK, init.StatusCode);
            Assert.Equal("spt-stash", (string)JObject.Parse(await init.Content.ReadAsStringAsync())["result"]["serverInfo"]["name"]);

            var note = await http.SendAsync(Post(port, "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}"));
            Assert.Equal(HttpStatusCode.Accepted, note.StatusCode);

            var call = await http.SendAsync(Post(port, "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"get_status\",\"arguments\":{}}}"));
            var res = JObject.Parse(await call.Content.ReadAsStringAsync());
            Assert.True((bool)res["result"]["structuredContent"]["ready"]);

            var bad = await http.SendAsync(Post(port, "not json"));
            Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        }

        [Fact]
        public async Task RejectsForeignOriginAndMissingToken()
        {
            int port = FreePort();
            using var server = Start(port, "secret");
            using var http = new HttpClient();
            const string ping = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}";

            var noToken = await http.SendAsync(Post(port, ping));
            Assert.Equal(HttpStatusCode.Unauthorized, noToken.StatusCode);

            var foreign = Post(port, ping);
            foreign.Headers.Add("Origin", "https://evil.example");
            foreign.Headers.Add("Authorization", "Bearer secret");
            Assert.Equal(HttpStatusCode.Forbidden, (await http.SendAsync(foreign)).StatusCode);

            var ok = Post(port, ping);
            ok.Headers.Add("Authorization", "Bearer secret");
            Assert.Equal(HttpStatusCode.OK, (await http.SendAsync(ok)).StatusCode);
        }
    }
}
