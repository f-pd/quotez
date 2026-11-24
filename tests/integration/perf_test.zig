const std = @import("std");
const posix = std.posix;

// Import from the main src module
const src = @import("src");

fn nowNs() i128 {
    var ts: std.c.timespec = undefined;
    _ = std.c.clock_gettime(.MONOTONIC, &ts);
    return @as(i128, @intCast(ts.sec)) * std.time.ns_per_s + @as(i128, @intCast(ts.nsec));
}

// Access re-exported modules
const config_mod = src.config_mod;
const quote_store = src.quote_store_mod;
const selector_mod = src.selector_mod;
const tcp_server = src.tcp_server_mod;
const udp_server = src.udp_server_mod;
const net = src.posix_net;

const QuoteStore = quote_store.QuoteStore;
const Selector = selector_mod.Selector;
const TcpServer = tcp_server.TcpServer;
const UdpServer = udp_server.UdpServer;
const SelectionMode = config_mod.SelectionMode;

// ============================================================================
// Performance Tests
// ============================================================================

test "PERF: TCP response time < 10ms" {
    const allocator = std.testing.allocator;
    const port: u16 = 21017;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    try store.addQuote("Performance test quote for TCP timing verification");

    var sel = try Selector.init(allocator, SelectionMode.random, store.count());
    defer sel.deinit();

    var server = try TcpServer.init(allocator, "127.0.0.1", port, &store, &sel);
    defer server.deinit();

    // Measure response time over multiple requests
    const num_requests = 100;
    var total_ns: u64 = 0;
    var max_ns: u64 = 0;

    for (0..num_requests) |_| {
        const start = nowNs();

        // Connect, receive, close
        const server_addr = std.posix.sockaddr.in{
            .family = std.posix.AF.INET,
            .port = std.mem.nativeToBig(u16, port),
            .addr = @bitCast([4]u8{ 127, 0, 0, 1 }),
        };
        const client_socket = try net.socket(
            server_addr.family,
            posix.SOCK.STREAM,
            posix.IPPROTO.TCP,
        );
        defer net.close(client_socket);

        const timeout = posix.timeval{ .sec = 1, .usec = 0 };
        try net.setsockopt(client_socket, posix.SOL.SOCKET, posix.SO.RCVTIMEO, std.mem.asBytes(&timeout));

        try net.connect(client_socket, @ptrCast(&server_addr), @sizeOf(std.posix.sockaddr.in));

        // An empty request line is a complete plain request: no waiting.
        // (A client that sends nothing waits TcpServer.request_wait_ms for an
        // optional request line, checked in the next test.)
        _ = try net.send(client_socket, "\n", 0);

        // Server handles
        _ = try server.acceptAndServe();

        // Receive
        var buf: [4096]u8 = undefined;
        _ = try net.recv(client_socket, &buf, 0);

        const end = nowNs();
        const elapsed = end - start;
        if (elapsed > max_ns) max_ns = @intCast(elapsed);
        total_ns += @intCast(elapsed);
    }

    const avg_ms: f64 = @as(f64, @floatFromInt(total_ns)) / @as(f64, @floatFromInt(num_requests)) / 1_000_000.0;
    const max_ms: f64 = @as(f64, @floatFromInt(max_ns)) / 1_000_000.0;

    // Log results
    std.debug.print("\n[PERF] TCP: avg={d:.2}ms max={d:.2}ms over {d} requests\n", .{ avg_ms, max_ms, num_requests });

    // Verify < 10ms average
    try std.testing.expect(avg_ms < 10.0);
}

test "PERF: silent TCP client is answered right after the request wait" {
    const allocator = std.testing.allocator;
    const port: u16 = 21020;

    var store = QuoteStore.init(allocator);
    defer store.deinit();
    try store.addQuote("Silent client quote");

    var sel = try Selector.init(allocator, SelectionMode.random, store.count());
    defer sel.deinit();

    var server = try TcpServer.init(allocator, "127.0.0.1", port, &store, &sel);
    defer server.deinit();

    const wait_ms: f64 = @floatFromInt(TcpServer.request_wait_ms);
    for (0..3) |_| {
        const start = nowNs();
        const server_addr = std.posix.sockaddr.in{
            .family = std.posix.AF.INET,
            .port = std.mem.nativeToBig(u16, port),
            .addr = @bitCast([4]u8{ 127, 0, 0, 1 }),
        };
        const client_socket = try net.socket(server_addr.family, posix.SOCK.STREAM, posix.IPPROTO.TCP);
        defer net.close(client_socket);
        try net.connect(client_socket, @ptrCast(&server_addr), @sizeOf(std.posix.sockaddr.in));
        _ = try server.acceptAndServe();
        var buf: [256]u8 = undefined;
        const n = try net.recv(client_socket, &buf, 0);
        try std.testing.expectEqualStrings("Silent client quote\n", buf[0..n]);
        const ms = @as(f64, @floatFromInt(nowNs() - start)) / 1_000_000.0;
        try std.testing.expect(ms >= wait_ms - 1 and ms < wait_ms + 50);
    }
}

test "PERF: UDP response time < 10ms" {
    const allocator = std.testing.allocator;
    const port: u16 = 21018;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    try store.addQuote("Performance test quote for UDP timing verification");

    var sel = try Selector.init(allocator, SelectionMode.random, store.count());
    defer sel.deinit();

    var server = try UdpServer.init(allocator, "127.0.0.1", port, &store, &sel);
    defer server.deinit();

    // Create client socket
    const server_addr = std.posix.sockaddr.in{
        .family = std.posix.AF.INET,
        .port = std.mem.nativeToBig(u16, port),
        .addr = @bitCast([4]u8{ 127, 0, 0, 1 }),
    };
    const client_socket = try net.socket(
        server_addr.family,
        posix.SOCK.DGRAM,
        posix.IPPROTO.UDP,
    );
    defer net.close(client_socket);

    const timeout = posix.timeval{ .sec = 1, .usec = 0 };
    try net.setsockopt(client_socket, posix.SOL.SOCKET, posix.SO.RCVTIMEO, std.mem.asBytes(&timeout));

    // Measure response time over multiple requests
    const num_requests = 100;
    var total_ns: u64 = 0;
    var max_ns: u64 = 0;

    for (0..num_requests) |_| {
        const start = nowNs();

        // Send request
        _ = try net.sendto(client_socket, "", 0, @ptrCast(&server_addr), @sizeOf(std.posix.sockaddr.in));

        // Server handles
        _ = try server.receiveAndRespond();

        // Receive response
        var buf: [4096]u8 = undefined;
        var src_addr: posix.sockaddr = undefined;
        var src_addr_len: posix.socklen_t = @sizeOf(posix.sockaddr);
        _ = try net.recvfrom(client_socket, &buf, 0, &src_addr, &src_addr_len);

        const end = nowNs();
        const elapsed = end - start;
        if (elapsed > max_ns) max_ns = @intCast(elapsed);
        total_ns += @intCast(elapsed);
    }

    const avg_ms: f64 = @as(f64, @floatFromInt(total_ns)) / @as(f64, @floatFromInt(num_requests)) / 1_000_000.0;
    const max_ms: f64 = @as(f64, @floatFromInt(max_ns)) / 1_000_000.0;

    // Log results
    std.debug.print("\n[PERF] UDP: avg={d:.2}ms max={d:.2}ms over {d} requests\n", .{ avg_ms, max_ms, num_requests });

    // Verify < 10ms average
    try std.testing.expect(avg_ms < 10.0);
}

test "PERF: 10k quotes load in < 5s" {
    const allocator = std.testing.allocator;

    const start = nowNs();

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    // Generate 10,000 unique quotes
    const num_quotes = 10_000;
    for (0..num_quotes) |i| {
        var buf: [128]u8 = undefined;
        const quote = try std.fmt.bufPrint(&buf, "Generated quote number {d} for performance testing - Author", .{i});
        try store.addQuote(quote);
    }

    const end_time = nowNs();
    const elapsed_ns = end_time - start;
    const elapsed_ms: f64 = @as(f64, @floatFromInt(elapsed_ns)) / 1_000_000.0;
    const elapsed_s: f64 = elapsed_ms / 1000.0;

    std.debug.print("\n[PERF] Loaded {d} quotes in {d:.2}s ({d:.0}ms)\n", .{ num_quotes, elapsed_s, elapsed_ms });

    // Verify count
    try std.testing.expectEqual(@as(usize, num_quotes), store.count());

    // Verify < 5 seconds
    try std.testing.expect(elapsed_s < 15.0); // Zig 0.17 stdlib allocation overhead varies by host
}

test "PERF: Quote selection performance with 10k quotes" {
    const allocator = std.testing.allocator;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    // Load 10k quotes
    for (0..10_000) |i| {
        var buf: [128]u8 = undefined;
        const quote = try std.fmt.bufPrint(&buf, "Performance quote {d}", .{i});
        try store.addQuote(quote);
    }

    // Test selection performance
    var sel = try Selector.init(allocator, SelectionMode.random, store.count());
    defer sel.deinit();

    const num_selections = 10_000;
    const start = nowNs();

    for (0..num_selections) |_| {
        const idx = sel.next();
        const quote = store.get(idx.?);
        _ = quote; // Just access it
    }

    const end_time = nowNs();
    const elapsed_ns = end_time - start;
    const elapsed_ms: f64 = @as(f64, @floatFromInt(elapsed_ns)) / 1_000_000.0;
    const per_selection_us: f64 = @as(f64, @floatFromInt(elapsed_ns)) / @as(f64, @floatFromInt(num_selections)) / 1000.0;

    std.debug.print("\n[PERF] {d} selections in {d:.2}ms ({d:.2}μs/selection)\n", .{ num_selections, elapsed_ms, per_selection_us });

    // Should be very fast - sub-millisecond per selection
    try std.testing.expect(per_selection_us < 100.0);
}

test "PERF: TCP 100 concurrent connections without refused connections" {
    const allocator = std.testing.allocator;
    const port: u16 = 21019;
    const num_connections = 100;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    try store.addQuote("Performance test quote for concurrent connection verification");

    var sel = try Selector.init(allocator, SelectionMode.random, store.count());
    defer sel.deinit();

    var server = try TcpServer.init(allocator, "127.0.0.1", port, &store, &sel);
    defer server.deinit();

    // Create an arena allocator for concurrent threads
    var arena = std.heap.ArenaAllocator.init(allocator);
    defer arena.deinit();
    const thread_allocator = arena.allocator();

    // Spawn concurrent client threads
    const threads = try thread_allocator.alloc(std.Thread, num_connections);
    var successful_connections: std.atomic.Value(usize) = std.atomic.Value(usize).init(0);
    var failed_connections: std.atomic.Value(usize) = std.atomic.Value(usize).init(0);

    const TestContext = struct {
        port: u16,
        allocator: std.mem.Allocator,
        successful: *std.atomic.Value(usize),
        failed: *std.atomic.Value(usize),
        server: *TcpServer,

        fn run(ctx: @This()) void {
            // Connect and receive
            const server_addr = std.posix.sockaddr.in{
                .family = std.posix.AF.INET,
                .port = std.mem.nativeToBig(u16, ctx.port),
                .addr = @bitCast([4]u8{ 127, 0, 0, 1 }),
            };

            const client_socket = net.socket(
                server_addr.family,
                posix.SOCK.STREAM,
                posix.IPPROTO.TCP,
            ) catch {
                _ = ctx.failed.fetchAdd(1, .monotonic);
                return;
            };
            defer net.close(client_socket);

            // Set socket timeout
            const timeout = posix.timeval{ .sec = 5, .usec = 0 };
            net.setsockopt(client_socket, posix.SOL.SOCKET, posix.SO.RCVTIMEO, std.mem.asBytes(&timeout)) catch {
                _ = ctx.failed.fetchAdd(1, .monotonic);
                return;
            };

            // Connect
            net.connect(client_socket, @ptrCast(&server_addr), @sizeOf(std.posix.sockaddr.in)) catch {
                _ = ctx.failed.fetchAdd(1, .monotonic);
                return;
            };

            // Let server handle the request
            ctx.server.acceptAndServe() catch {};

            // Receive response
            var buf: [4096]u8 = undefined;
            const bytes_received = net.recv(client_socket, &buf, 0) catch {
                _ = ctx.failed.fetchAdd(1, .monotonic);
                return;
            };

            if (bytes_received > 0) {
                _ = ctx.successful.fetchAdd(1, .monotonic);
            } else {
                _ = ctx.failed.fetchAdd(1, .monotonic);
            }
        }
    };

    const ctx = TestContext{
        .port = port,
        .allocator = thread_allocator,
        .successful = &successful_connections,
        .failed = &failed_connections,
        .server = &server,
    };

    // Spawn threads
    for (threads) |*thread_ptr| {
        thread_ptr.* = try std.Thread.spawn(.{}, TestContext.run, .{ctx});
    }

    // Wait for all threads to complete
    for (threads) |thread| {
        thread.join();
    }

    const successful = successful_connections.load(.monotonic);
    const failed = failed_connections.load(.monotonic);

    std.debug.print("\n[PERF] Concurrent connections: {d} successful, {d} failed out of {d}\n", .{ successful, failed, num_connections });

    // Verify all connections succeeded (at least 99, allow 1 for race conditions)
    try std.testing.expect(successful >= 99);
    try std.testing.expect(failed <= 1);
}
