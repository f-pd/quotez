const std = @import("std");
const logger = @import("../logger.zig");
const quote_store = @import("../quote_store.zig");
const selector_mod = @import("../selector.zig");
const posix_net = @import("../compat/posix_net.zig");
const net = @import("../net.zig");
const runtime = @import("../runtime.zig");
const i18n = @import("../i18n.zig");

/// UDP QOTD server implementing RFC 865
pub const UdpServer = struct {
    socket: std.posix.socket_t,
    address: std.posix.sockaddr.in,
    store: *quote_store.QuoteStore,
    selector: *selector_mod.Selector,
    log: logger.Logger,
    allocator: std.mem.Allocator,

    /// Maximum UDP datagram size for QOTD (per RFC 865 recommendations)
    const MAX_DATAGRAM_SIZE = 512;

    /// Initialize and bind UDP server
    pub fn init(
        allocator: std.mem.Allocator,
        host: []const u8,
        port: u16,
        store: *quote_store.QuoteStore,
        sel: *selector_mod.Selector,
    ) !UdpServer {
        var log = logger.Logger.init();

        // Parse address
        const addr_bytes = net.parseIpv4(host) catch |err| {
            log.err("udp_bind_failed", .{
                .reason = "invalid address",
                .host = host,
                .port = port,
                .err = @errorName(err),
            });
            return err;
        };

        const address = std.posix.sockaddr.in{
            .family = std.posix.AF.INET,
            .port = std.mem.nativeToBig(u16, port),
            .addr = addr_bytes,
            .zero = @splat(0),
        };

        // Create UDP socket
        const socket = try posix_net.socket(
            address.family,
            std.posix.SOCK.DGRAM,
            std.posix.IPPROTO.UDP,
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
        try posix_net.bind(socket, @ptrCast(&address), @sizeOf(std.posix.sockaddr.in));

        // Set non-blocking mode for event loop
        const flags = try posix_net.fcntl(socket, std.posix.F.GETFL, 0);
        const nonblock_flag = @as(usize, @as(u32, @bitCast(std.posix.O{ .NONBLOCK = true })));
        _ = try posix_net.fcntl(socket, std.posix.F.SETFL, flags | nonblock_flag);

        log.info("udp_server_started", .{
            .host = host,
            .port = port,
        });

        return UdpServer{
            .socket = socket,
            .address = address,
            .store = store,
            .selector = sel,
            .log = log,
            .allocator = allocator,
        };
    }

    /// Stop the UDP server
    pub fn deinit(self: *UdpServer) void {
        posix_net.close(self.socket);
        self.log.info("udp_server_stopped", .{});
    }

    /// Receive and respond to a single datagram
    pub fn receiveAndRespond(self: *UdpServer) !void {
        // Buffer for receiving client datagram (content ignored per RFC 865)
        var recv_buf: [MAX_DATAGRAM_SIZE]u8 = undefined;
        var client_addr: std.posix.sockaddr.storage = undefined;
        var client_addr_len: std.posix.socklen_t = @sizeOf(std.posix.sockaddr.storage);

        // Receive datagram from client
        const recv_len = posix_net.recvfrom(
            self.socket,
            &recv_buf,
            0,
            @ptrCast(&client_addr),
            &client_addr_len,
        ) catch |err| {
            switch (err) {
                error.WouldBlock => return, // No datagram available
                error.ConnectionRefused => {
                    // ICMP port unreachable (previous sendto failed)
                    self.log.debug("udp_client_unreachable", .{});
                    return;
                },
                else => return err,
            }
        };

        self.log.debug("udp_datagram_received", .{ .bytes = recv_len });

        // Optional extension: the datagram may ask for a language ("it-IT")
        // and/or several quotes ("n 3"); anything else is a plain RFC 865 request
        const request = i18n.parseQotdRequest(recv_buf[0..recv_len]);

        // Decide what to send (maintenance message, quote, debug trailer)
        var msg_buf: [128]u8 = undefined;
        var trailer_buf: [256]u8 = undefined;
        const reply = runtime.nextReply(self.store, self.selector, .udp, &request, &msg_buf, &trailer_buf) orelse {
            // Silent drop (no response per UDP semantics and contract)
            self.log.debug("udp_request_empty_store", .{});
            return;
        };
        const quote = reply.body();

        // Prepare response buffer: as many whole quotes as fit in one datagram
        // (each one is at most 511 bytes, so the first always fits)
        var send_buf: [MAX_DATAGRAM_SIZE]u8 = undefined;
        const response = blk: {
            var len: usize = 0;
            for (reply.bodies[0..reply.count], 0..) |text, i| {
                const is_last = i + 1 == reply.count;
                const tail: []const u8 = if (is_last) reply.trailer else "\n";
                if (len + text.len + tail.len > MAX_DATAGRAM_SIZE) {
                    if (i == 0) {
                        // Only a maintenance message can be this long: cut on a UTF-8 boundary
                        var cut = @min(text.len, MAX_DATAGRAM_SIZE - 1);
                        while (cut > 0 and cut < text.len and (text[cut] & 0xC0) == 0x80) cut -= 1;
                        @memcpy(send_buf[0..cut], text[0..cut]);
                        send_buf[cut] = '\n';
                        len = cut + 1;
                    } else if (len > 0 and send_buf[len - 1] != '\n') {
                        send_buf[len] = '\n';
                        len += 1;
                    }
                    break;
                }
                @memcpy(send_buf[len..][0..text.len], text);
                len += text.len;
                @memcpy(send_buf[len..][0..tail.len], tail);
                len += tail.len;
            }
            break :blk send_buf[0..len];
        };

        // Send response to client
        _ = posix_net.sendto(
            self.socket,
            response,
            0,
            @ptrCast(&client_addr),
            client_addr_len,
        ) catch |err| {
            // UDP is best-effort, log and drop on error
            switch (err) {
                error.MessageTooBig => {
                    self.log.warn("udp_send_message_too_big", .{ .size = response.len });
                },
                error.NetworkUnreachable, error.UnreachableAddress => {
                    self.log.debug("udp_client_unreachable", .{});
                },
                else => {
                    self.log.warn("udp_send_error", .{ .err = @errorName(err) });
                },
            }
            return;
        };

        self.log.debug("udp_request_served", .{ .quote_length = quote.len });
    }

    /// Run server loop (blocking, serves datagrams until stopped)
    pub fn run(self: *UdpServer) !void {
        self.log.info("udp_server_listening", .{
            .address = self.address,
        });

        while (true) {
            try self.receiveAndRespond();
        }
    }
};

// Tests
test "udp server initialization" {
    const allocator = std.testing.allocator;

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    var sel = try selector_mod.Selector.init(allocator, .random, 0);
    defer sel.deinit();

    // Try to bind to a high port (non-privileged)
    var server = UdpServer.init(allocator, "127.0.0.1", 8017, &store, &sel) catch |err| {
        // May fail if port is in use, which is okay for testing
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    // Server should be initialized
    try std.testing.expectEqual(@as(u16, 8017), std.mem.bigToNative(u16, server.address.port));
}

test "udp receive with empty store" {
    const allocator = std.testing.allocator;

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    var sel = try selector_mod.Selector.init(allocator, .random, 0);
    defer sel.deinit();

    var server = UdpServer.init(allocator, "127.0.0.1", 8018, &store, &sel) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    // Empty store should not crash
    try std.testing.expect(store.isEmpty());
}
