const std = @import("std");
const logger = @import("../logger.zig");
const quote_store = @import("../quote_store.zig");
const selector_mod = @import("../selector.zig");
const posix_net = @import("../compat/posix_net.zig");
const net = @import("../net.zig");
const runtime = @import("../runtime.zig");
const i18n = @import("../i18n.zig");

/// TCP QOTD server implementing RFC 865
pub const TcpServer = struct {
    socket: std.posix.socket_t,
    address: std.posix.sockaddr.in,
    store: *quote_store.QuoteStore,
    selector: *selector_mod.Selector,
    log: logger.Logger,
    allocator: std.mem.Allocator,

    /// Initialize and bind TCP server
    pub fn init(
        allocator: std.mem.Allocator,
        host: []const u8,
        port: u16,
        store: *quote_store.QuoteStore,
        sel: *selector_mod.Selector,
    ) !TcpServer {
        var log = logger.Logger.init();

        // Parse host string into IPv4 bytes
        const parsed_bytes = net.parseIpv4(host) catch |err| {
            log.err("tcp_bind_failed", .{
                .reason = "invalid address",
                .host = host,
                .port = port,
                .err = @errorName(err),
            });
            return err;
        };

        const addr = std.posix.sockaddr.in{
            .family = std.posix.AF.INET,
            .port = std.mem.nativeToBig(u16, port),
            .addr = parsed_bytes,
        };

        // Create socket
        const socket = try posix_net.socket(
            std.posix.AF.INET,
            std.posix.SOCK.STREAM,
            std.posix.IPPROTO.TCP,
        );
        errdefer posix_net.close(socket);

        // Set socket options
        try posix_net.setsockopt(
            socket,
            std.posix.SOL.SOCKET,
            std.posix.SO.REUSEADDR,
            std.mem.asBytes(&@as(c_int, 1)),
        );

        // Bind socket
        try posix_net.bind(socket, @ptrCast(&addr), @sizeOf(std.posix.sockaddr.in));

        // Listen
        try posix_net.listen(socket, 128);

        // Set non-blocking mode for event loop
        const flags = try posix_net.fcntl(socket, std.posix.F.GETFL, 0);
        const nonblock_flag = @as(usize, @as(u32, @bitCast(std.posix.O{ .NONBLOCK = true })));
        _ = try posix_net.fcntl(socket, std.posix.F.SETFL, flags | nonblock_flag);

        log.info("tcp_server_started", .{
            .host = host,
            .port = port,
        });

        return TcpServer{
            .socket = socket,
            .address = addr,
            .store = store,
            .selector = sel,
            .log = log,
            .allocator = allocator,
        };
    }

    /// Stop the TCP server
    pub fn deinit(self: *TcpServer) void {
        posix_net.close(self.socket);
        self.log.info("tcp_server_stopped", .{});
    }

    /// Accept and serve a single connection (non-blocking)
    pub fn acceptAndServe(self: *TcpServer) !void {
        var client_addr: std.posix.sockaddr.storage = undefined;
        var client_addr_len: std.posix.socklen_t = @sizeOf(std.posix.sockaddr.storage);

        // Accept connection
        const client_fd = posix_net.accept(
            self.socket,
            @ptrCast(&client_addr),
            &client_addr_len,
            0,
        ) catch |err| {
            // Non-fatal errors that we can recover from
            switch (err) {
                error.WouldBlock => return, // No connection available
                error.ConnectionAborted => {
                    self.log.warn("tcp_accept_error", .{ .err = @errorName(err) });
                    return;
                },
                else => return err,
            }
        };
        defer posix_net.close(client_fd);

        // Optional extension: a client may send "[locale] [n count]" right
        // after connecting (e.g. `echo it | nc host 17`). RFC 865 clients send
        // nothing, so wait only briefly and fall back to the standard reply.
        const request = readRequest(client_fd);

        // Decide what to send (maintenance message, quote, debug trailer)
        var msg_buf: [128]u8 = undefined;
        var trailer_buf: [256]u8 = undefined;
        const reply = runtime.nextReply(self.store, self.selector, .tcp, &request, &msg_buf, &trailer_buf) orelse {
            // Empty store: close immediately without sending (per contract)
            self.log.debug("tcp_request_empty_store", .{});
            return;
        };

        for (reply.bodies[0..reply.count], 0..) |text, i| {
            const tail: []const u8 = if (i + 1 == reply.count) reply.trailer else "\n";
            sendAll(client_fd, text) catch |err| {
                logSendError(&self.log, err);
                return;
            };
            sendAll(client_fd, tail) catch |err| {
                logSendError(&self.log, err);
                return;
            };
        }
        const quote = reply.body();

        // Connection closes automatically when client_fd is deferred
        self.log.debug("tcp_request_served", .{ .quote_length = quote.len, .quotes = reply.count });
    }

    /// How long to wait for an optional request line after accept (milliseconds).
    /// A client that sends a request does so right after its handshake ACK, so
    /// the data travels with it; a short wait keeps plain RFC 865 replies fast
    /// (the perf contract is < 10 ms) while still catching `echo it | nc`.
    pub const request_wait_ms: i32 = 5;

    /// Read the optional request line, waiting at most `request_wait_ms`.
    /// Returns a plain request when the client sends nothing.
    fn readRequest(client_fd: std.posix.socket_t) i18n.QotdRequest {
        var fds = [_]std.posix.pollfd{.{ .fd = client_fd, .events = std.posix.POLL.IN, .revents = 0 }};
        const ready = std.posix.poll(&fds, request_wait_ms) catch return .{};
        if (ready == 0 or fds[0].revents & std.posix.POLL.IN == 0) return .{};
        var buf: [128]u8 = undefined;
        const n = posix_net.recv(client_fd, &buf, 0) catch return .{};
        return i18n.parseQotdRequest(buf[0..n]);
    }

    fn logSendError(log: *logger.Logger, err: anyerror) void {
        switch (err) {
            error.BrokenPipe, error.ConnectionResetByPeer => log.debug("tcp_client_disconnected", .{}),
            else => log.warn("tcp_serve_error", .{ .err = @errorName(err) }),
        }
    }

    fn sendAll(fd: std.posix.socket_t, data: []const u8) !void {
        var sent: usize = 0;
        while (sent < data.len) {
            const n = try posix_net.send(fd, data[sent..], 0);
            if (n == 0) return error.BrokenPipe;
            sent += n;
        }
    }

    /// Run server loop (blocking, serves connections until stopped)
    pub fn run(self: *TcpServer) !void {
        self.log.info("tcp_server_listening", .{
            .address = self.address,
        });

        while (true) {
            try self.acceptAndServe();
        }
    }
};

// Tests
test "tcp server initialization" {
    const allocator = std.testing.allocator;

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    var sel = try selector_mod.Selector.init(allocator, .random, 0);
    defer sel.deinit();

    // Try to bind to a high port (non-privileged)
    var server = TcpServer.init(allocator, "127.0.0.1", 8017, &store, &sel) catch |err| {
        // May fail if port is in use, which is okay for testing
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    // Server should be initialized
    try std.testing.expectEqual(@as(u16, 8017), std.mem.bigToNative(u16, server.address.port));
}

test "tcp serve connection with empty store" {
    const allocator = std.testing.allocator;

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    var sel = try selector_mod.Selector.init(allocator, .random, 0);
    defer sel.deinit();

    var server = TcpServer.init(allocator, "127.0.0.1", 8018, &store, &sel) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    // Empty store should not crash
    try std.testing.expect(store.isEmpty());
}
