const std = @import("std");
const testing = std.testing;

// Integration tests for the backoffice API: statistics, maintenance and debug
// modes, live logs, and large/escaped payloads on /api/quotes.

const src = @import("src");
const quote_store = src.quote_store_mod;
const selector_mod = src.selector_mod;
const tcp_server = src.tcp_server_mod;
const http_server = src.http_server_mod;
const watcher_mod = src.watcher_mod;
const config_mod = src.config_mod;
const runtime = src.runtime_mod;
const posix_net = src.posix_net;
const net = src.net_mod;

const TCP_PORT: u16 = 18117;
const HTTP_PORT: u16 = 18118;
const AUTH = "Authorization: Basic YWRtaW46cXVvdGV6\r\n"; // admin:quotez

fn connectTo(port: u16) !std.posix.socket_t {
    const fd = try posix_net.socket(std.posix.AF.INET, std.posix.SOCK.STREAM, std.posix.IPPROTO.TCP);
    errdefer posix_net.close(fd);
    const addr = std.posix.sockaddr.in{
        .family = std.posix.AF.INET,
        .port = std.mem.nativeToBig(u16, port),
        .addr = try net.parseIpv4("127.0.0.1"),
    };
    try posix_net.connect(fd, @ptrCast(&addr), @sizeOf(std.posix.sockaddr.in));
    return fd;
}

fn readAll(fd: std.posix.socket_t, buf: []u8) ![]const u8 {
    var n: usize = 0;
    while (n < buf.len) {
        const m = try posix_net.recv(fd, buf[n..], 0);
        if (m == 0) break;
        n += m;
    }
    return buf[0..n];
}

fn qotd(tcp: *tcp_server.TcpServer, buf: []u8) ![]const u8 {
    const fd = try connectTo(TCP_PORT);
    defer posix_net.close(fd);
    try tcp.acceptAndServe();
    return readAll(fd, buf);
}

fn http(server: *http_server.HttpServer, request: []const u8, buf: []u8) ![]const u8 {
    const fd = try connectTo(HTTP_PORT);
    defer posix_net.close(fd);
    _ = try posix_net.send(fd, request, 0);
    try server.acceptAndServe();
    return readAll(fd, buf);
}

fn body(resp: []const u8) []const u8 {
    const sep = std.mem.indexOf(u8, resp, "\r\n\r\n") orelse return "";
    return resp[sep + 4 ..];
}

fn contains(haystack: []const u8, needle: []const u8) bool {
    return std.mem.indexOf(u8, haystack, needle) != null;
}

test "backoffice: stats, maintenance, debug, logs, large and escaped quotes" {
    const allocator = testing.allocator;
    runtime.state.resetStats();
    defer runtime.state.quote_counts.clearAndFree(std.heap.c_allocator);

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();
    try store.add("Alpha quote");
    try store.add("Beta quote");

    var sel = try selector_mod.Selector.init(allocator, .sequential, store.count());
    defer sel.deinit();

    var watcher = try watcher_mod.FileWatcher.init(allocator, &.{}, 60);
    defer watcher.deinit();

    var tmp = testing.tmpDir(.{});
    defer tmp.cleanup();
    const api_path = try std.fmt.allocPrint(allocator, ".zig-cache/tmp/{s}/api.json", .{tmp.sub_path});
    defer allocator.free(api_path);

    var config = config_mod.Configuration{
        .host = "127.0.0.1",
        .tcp_port = TCP_PORT,
        .udp_port = TCP_PORT,
        .health_enabled = true,
        .health_port = HTTP_PORT,
        .directories = &.{},
        .selection_mode = .sequential,
        .polling_interval = 60,
        .api_enabled = true,
        .api_username = "admin",
        .api_password = "quotez",
        .api_quotes_path = api_path,
        .allocator = allocator,
    };

    var tcp = tcp_server.TcpServer.init(allocator, "127.0.0.1", TCP_PORT, &store, &sel) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer tcp.deinit();
    var server = http_server.HttpServer.init(allocator, "127.0.0.1", HTTP_PORT, &store, "admin", "quotez", &sel, &watcher, 0, api_path, &config) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    var qbuf: [1024]u8 = undefined;
    var hbuf: [256 * 1024]u8 = undefined;

    // Serve three quotes: sequential mode gives Alpha, Beta, Alpha
    try testing.expectEqualStrings("Alpha quote\n", try qotd(&tcp, &qbuf));
    try testing.expectEqualStrings("Beta quote\n", try qotd(&tcp, &qbuf));
    try testing.expectEqualStrings("Alpha quote\n", try qotd(&tcp, &qbuf));

    // Stats reflect what was served
    var resp = try http(&server, "GET /api/stats?top=5 HTTP/1.1\r\n" ++ AUTH ++ "\r\n", &hbuf);
    try testing.expect(contains(resp, "200 OK"));
    try testing.expect(contains(body(resp), "\"total\":3,\"tcp\":3"));
    try testing.expect(contains(body(resp), "{\"id\":0,\"served\":2,\"text\":\"Alpha quote\"}"));

    // Quote list exposes per-quote counters
    resp = try http(&server, "GET /api/quotes HTTP/1.1\r\n" ++ AUTH ++ "\r\n", &hbuf);
    try testing.expect(contains(body(resp), "\"text\":\"Beta quote\",\"served\":1,\"source\":null"));

    // Maintenance with a custom message replaces quotes on QOTD
    const maint_body = "{\"enabled\":true,\"message\":\"Back \\\"soon\\\"\"}";
    resp = try http(&server, std.fmt.comptimePrint(
        "POST /api/maintenance HTTP/1.1\r\n" ++ AUTH ++ "Content-Length: {d}\r\n\r\n{s}",
        .{ maint_body.len, maint_body },
    ), &hbuf);
    try testing.expect(contains(body(resp), "\"maintenance\":true"));
    try testing.expectEqualStrings("Back \"soon\"\n", try qotd(&tcp, &qbuf));
    resp = try http(&server, "GET /api/status HTTP/1.1\r\n" ++ AUTH ++ "\r\n", &hbuf);
    try testing.expect(contains(body(resp), "\"status\":\"maintenance\""));
    const off_body = "{\"enabled\":false}";
    resp = try http(&server, std.fmt.comptimePrint(
        "POST /api/maintenance HTTP/1.1\r\n" ++ AUTH ++ "Content-Length: {d}\r\n\r\n{s}",
        .{ off_body.len, off_body },
    ), &hbuf);
    try testing.expect(contains(body(resp), "\"maintenance\":false"));

    // Debug mode appends internal state to the QOTD reply
    const dbg_body = "{\"enabled\":true}";
    resp = try http(&server, std.fmt.comptimePrint(
        "POST /api/debug HTTP/1.1\r\n" ++ AUTH ++ "Content-Length: {d}\r\n\r\n{s}",
        .{ dbg_body.len, dbg_body },
    ), &hbuf);
    try testing.expect(contains(body(resp), "\"debug\":true"));
    const dbg_reply = try qotd(&tcp, &qbuf);
    try testing.expect(contains(dbg_reply, "[debug id=1 mode=sequential"));
    runtime.state.setDebug(false);

    // Logs captured the mode changes
    resp = try http(&server, "GET /api/logs?level=info HTTP/1.1\r\n" ++ AUTH ++ "\r\n", &hbuf);
    try testing.expect(contains(body(resp), "maintenance_mode_changed enabled=true"));
    try testing.expect(contains(body(resp), "debug_mode_changed enabled=true"));

    // Escaped JSON is decoded before storing
    const post_body = "{\"text\":\"Say \\\"hi\\\" caf\\u00e9\"}";
    resp = try http(&server, std.fmt.comptimePrint(
        "POST /api/quotes HTTP/1.1\r\n" ++ AUTH ++ "Content-Length: {d}\r\n\r\n{s}",
        .{ post_body.len, post_body },
    ), &hbuf);
    try testing.expect(contains(resp, "201 Created"));
    try testing.expectEqualStrings("Say \"hi\" café", store.get(store.count() - 1).?);

    // Responses larger than the old 4 KB limit arrive complete
    var i: usize = 0;
    while (i < 300) : (i += 1) {
        var tb: [64]u8 = undefined;
        try store.add(try std.fmt.bufPrint(&tb, "Filler quote number {d} with some padding", .{i}));
    }
    resp = try http(&server, "GET /api/quotes HTTP/1.1\r\n" ++ AUTH ++ "\r\n", &hbuf);
    try testing.expect(contains(resp, "200 OK"));
    try testing.expect(body(resp).len > 4096);
    try testing.expect(std.mem.endsWith(u8, body(resp), "\"count\":303}"));

    // Reset clears counters
    resp = try http(&server, "POST /api/stats/reset HTTP/1.1\r\n" ++ AUTH ++ "Content-Length: 0\r\n\r\n", &hbuf);
    try testing.expect(contains(resp, "200 OK"));
    try testing.expectEqual(@as(u64, 0), runtime.state.totalServed());
}
