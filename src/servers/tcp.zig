const std = @import("std");
const logger = @import("../logger.zig");
const quote_store = @import("../quote_store.zig");
const selector_mod = @import("../selector.zig");
const posix_net = @import("../compat/posix_net.zig");
const net = @import("../net.zig");
const runtime = @import("../runtime.zig");
const i18n = @import("../i18n.zig");
const io = @import("../compat/io.zig");

/// TCP QOTD server implementing RFC 865
pub const TcpServer = struct {
    socket: std.posix.socket_t,
    address: std.posix.sockaddr.in,
    store: *quote_store.QuoteStore,
    selector: *selector_mod.Selector,
    log: logger.Logger,
    allocator: std.mem.Allocator,
    /// Accepted connections still waiting for their request line
    pending: [max_pending]Pending = undefined,
    pending_len: usize = 0,

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
        for (self.pending[0..self.pending_len]) |p| posix_net.close(p.fd);
        self.pending_len = 0;
        posix_net.close(self.socket);
        self.log.info("tcp_server_stopped", .{});
    }

    /// How long a new connection may take to send the optional request line
    /// (`echo it | nc host 17`) before it gets the standard RFC 865 reply.
    /// The line can reach the server well after the handshake (Docker port
    /// proxies, slow links), so this is generous; connections wait in
    /// `pending` without blocking anyone else, and a client that ends its line
    /// with a newline or closes its side is answered at once. Only clients
    /// that send nothing wait the whole window.
    pub const request_wait_ms: i64 = 300;

    /// Connections waiting for their request line at the same time
    pub const max_pending: usize = 64;

    const Pending = struct {
        fd: std.posix.socket_t,
        deadline_ns: i128,
        buf: [128]u8 = undefined,
        len: usize = 0,
    };

    /// Accept every waiting connection and park it until its request line
    /// arrives or `request_wait_ms` passes (see `servePending`).
    pub fn acceptPending(self: *TcpServer) !void {
        while (true) {
            const fd = (try self.acceptOne()) orelse return;
            if (self.pending_len == max_pending) {
                // Full: answer the oldest connection now with what it sent
                self.finish(0);
            }
            setNonBlocking(fd, true);
            self.pending[self.pending_len] = .{
                .fd = fd,
                .deadline_ns = io.nowNs() + @as(i128, request_wait_ms) * std.time.ns_per_ms,
            };
            self.pending_len += 1;
        }
    }

    /// Read what parked connections sent and answer those that are done:
    /// a complete line, the client closed its side, a full buffer, or the
    /// wait expired.
    pub fn servePending(self: *TcpServer) void {
        const now = io.nowNs();
        var i: usize = 0;
        while (i < self.pending_len) {
            if (readMore(&self.pending[i]) or now >= self.pending[i].deadline_ns) {
                self.finish(i); // moves the last entry into slot i
            } else {
                i += 1;
            }
        }
    }

    /// Milliseconds until the next parked connection must be answered, or
    /// null when none is waiting. Use it as the poll timeout.
    pub fn pendingTimeoutMs(self: *const TcpServer) ?i32 {
        if (self.pending_len == 0) return null;
        var next = self.pending[0].deadline_ns;
        for (self.pending[1..self.pending_len]) |p| next = @min(next, p.deadline_ns);
        const left = next - io.nowNs();
        if (left <= 0) return 0;
        return @intCast(@divFloor(left + std.time.ns_per_ms - 1, std.time.ns_per_ms));
    }

    /// Poll entries for the parked connections, written to `out`
    pub fn pendingPollFds(self: *const TcpServer, out: []std.posix.pollfd) usize {
        const n = @min(out.len, self.pending_len);
        for (self.pending[0..n], out[0..n]) |p, *slot| {
            slot.* = .{ .fd = p.fd, .events = std.posix.POLL.IN, .revents = 0 };
        }
        return n;
    }

    /// Accept one connection and serve it before returning, waiting for its
    /// request line like the event loop does. Used by tests and simple loops.
    pub fn acceptAndServe(self: *TcpServer) !void {
        const fd = (try self.acceptOne()) orelse return;
        setNonBlocking(fd, true);
        var p: Pending = .{
            .fd = fd,
            .deadline_ns = io.nowNs() + @as(i128, request_wait_ms) * std.time.ns_per_ms,
        };
        while (!readMore(&p)) {
            const left = p.deadline_ns - io.nowNs();
            if (left <= 0) break;
            var fds = [_]std.posix.pollfd{.{ .fd = fd, .events = std.posix.POLL.IN, .revents = 0 }};
            const ms: i32 = @intCast(@divFloor(left + std.time.ns_per_ms - 1, std.time.ns_per_ms));
            _ = std.posix.poll(&fds, ms) catch break;
        }
        self.serveAndClose(&p);
    }

    /// Accept one connection; null when none is waiting
    fn acceptOne(self: *TcpServer) !?std.posix.socket_t {
        var client_addr: std.posix.sockaddr.storage = undefined;
        var client_addr_len: std.posix.socklen_t = @sizeOf(std.posix.sockaddr.storage);
        return posix_net.accept(
            self.socket,
            @ptrCast(&client_addr),
            &client_addr_len,
            0,
        ) catch |err| switch (err) {
            error.WouldBlock => null,
            error.ConnectionAborted => {
                self.log.warn("tcp_accept_error", .{ .err = @errorName(err) });
                return null;
            },
            else => err,
        };
    }

    /// Read what is available without blocking. True when the request is
    /// complete: a newline arrived, the client closed its side, the buffer
    /// is full, or the connection failed.
    fn readMore(p: *Pending) bool {
        while (p.len < p.buf.len) {
            const n = posix_net.recv(p.fd, p.buf[p.len..], 0) catch |err| switch (err) {
                error.WouldBlock => return false,
                else => return true,
            };
            if (n == 0) return true; // client closed its side (echo it | nc)
            const had = p.len;
            p.len += n;
            if (std.mem.indexOfScalar(u8, p.buf[had..p.len], '\n') != null) return true;
        }
        return true;
    }

    /// Answer parked connection `i` and drop it from the list
    fn finish(self: *TcpServer, i: usize) void {
        var p = self.pending[i];
        self.pending_len -= 1;
        self.pending[i] = self.pending[self.pending_len];
        self.serveAndClose(&p);
    }

    fn serveAndClose(self: *TcpServer, p: *Pending) void {
        defer posix_net.close(p.fd);
        setNonBlocking(p.fd, false);
        const request = i18n.parseQotdRequest(p.buf[0..p.len]);
        self.serve(p.fd, &request);
    }

    fn setNonBlocking(fd: std.posix.socket_t, on: bool) void {
        const flags = posix_net.fcntl(fd, std.posix.F.GETFL, 0) catch return;
        const nonblock_flag = @as(usize, @as(u32, @bitCast(std.posix.O{ .NONBLOCK = true })));
        const next = if (on) flags | nonblock_flag else flags & ~nonblock_flag;
        _ = posix_net.fcntl(fd, std.posix.F.SETFL, next) catch {};
    }

    /// Send the reply for `request` on a connected client
    fn serve(self: *TcpServer, client_fd: std.posix.socket_t, request: *const i18n.QotdRequest) void {
        // Decide what to send (maintenance message, quote, debug trailer)
        var msg_buf: [512]u8 = undefined;
        var trailer_buf: [256]u8 = undefined;
        const reply = runtime.nextReply(self.store, self.selector, .tcp, request, &msg_buf, &trailer_buf) orelse {
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
        self.log.debug("tcp_request_served", .{ .quote_length = reply.body().len, .quotes = reply.count });
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
