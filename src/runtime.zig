//! Process-wide runtime state shared by the QOTD servers and the backoffice API:
//! operational modes (maintenance, debug) and serving statistics.
//!
//! The service runs a single-threaded poll() loop, so plain fields are safe.
//! The state is a module-level singleton so the TCP/UDP/HTTP servers can share
//! it without threading another pointer through every constructor.

const std = @import("std");
const app_io = @import("compat/io.zig");
const logger = @import("logger.zig");
const quote_store = @import("quote_store.zig");
const selector_mod = @import("selector.zig");

pub const TIMELINE_MINUTES = 60;
pub const MAX_MAINTENANCE_MESSAGE = 512;
pub const DEFAULT_MAINTENANCE_MESSAGE = "The quote service is under maintenance. Please try again later.";

pub const Protocol = enum { tcp, udp };

pub const Runtime = struct {
    // Operational modes
    maintenance: bool = false,
    maintenance_msg_buf: [MAX_MAINTENANCE_MESSAGE]u8 = undefined,
    maintenance_msg_len: usize = 0,
    debug: bool = false,

    // Counters since start (or last reset)
    tcp_served: u64 = 0,
    udp_served: u64 = 0,
    maintenance_served: u64 = 0,
    empty_responses: u64 = 0,
    http_requests: u64 = 0,
    api_requests: u64 = 0,
    auth_failures: u64 = 0,
    reloads: u64 = 0,
    last_served_ns: i128 = 0,
    stats_since_ns: i128 = 0,

    // Requests per minute, ring indexed by absolute minute % TIMELINE_MINUTES
    bucket_counts: [TIMELINE_MINUTES]u32 = @splat(0),
    bucket_minute: [TIMELINE_MINUTES]i64 = @splat(-1),

    // Times each quote has been served, keyed by a hash of its text so counts
    // survive reloads and index shifts.
    quote_counts: std.AutoHashMapUnmanaged(u64, u64) = .empty,

    pub fn maintenanceMessage(self: *const Runtime) []const u8 {
        if (self.maintenance_msg_len == 0) return DEFAULT_MAINTENANCE_MESSAGE;
        return self.maintenance_msg_buf[0..self.maintenance_msg_len];
    }

    /// Set the maintenance message (truncated to MAX_MAINTENANCE_MESSAGE).
    /// An empty message restores the default.
    pub fn setMaintenanceMessage(self: *Runtime, msg: []const u8) void {
        const trimmed = std.mem.trim(u8, msg, " \t\r\n");
        const n = @min(trimmed.len, MAX_MAINTENANCE_MESSAGE);
        @memcpy(self.maintenance_msg_buf[0..n], trimmed[0..n]);
        self.maintenance_msg_len = n;
    }

    pub fn setDebug(self: *Runtime, enabled: bool) void {
        self.debug = enabled;
        logger.min_level = if (enabled) .debug else .info;
    }

    pub fn totalServed(self: *const Runtime) u64 {
        return self.tcp_served + self.udp_served;
    }

    fn bumpTimeline(self: *Runtime, now_ns: i128) void {
        const minute: i64 = @intCast(@divTrunc(now_ns, 60 * std.time.ns_per_s));
        const idx: usize = @intCast(@mod(minute, TIMELINE_MINUTES));
        if (self.bucket_minute[idx] != minute) {
            self.bucket_minute[idx] = minute;
            self.bucket_counts[idx] = 0;
        }
        self.bucket_counts[idx] +|= 1;
    }

    /// Requests per minute for the last TIMELINE_MINUTES minutes, oldest first.
    pub fn timeline(self: *const Runtime, out: *[TIMELINE_MINUTES]u32) void {
        const now_minute: i64 = @intCast(@divTrunc(app_io.nowNs(), 60 * std.time.ns_per_s));
        for (0..TIMELINE_MINUTES) |k| {
            const minute = now_minute - (TIMELINE_MINUTES - 1) + @as(i64, @intCast(k));
            const idx: usize = @intCast(@mod(minute, TIMELINE_MINUTES));
            out[k] = if (self.bucket_minute[idx] == minute) self.bucket_counts[idx] else 0;
        }
    }

    pub fn recordServed(self: *Runtime, proto: Protocol, text: []const u8) void {
        const now = app_io.nowNs();
        switch (proto) {
            .tcp => self.tcp_served += 1,
            .udp => self.udp_served += 1,
        }
        self.last_served_ns = now;
        self.bumpTimeline(now);
        const gop = self.quote_counts.getOrPut(std.heap.c_allocator, quoteKey(text)) catch return;
        if (!gop.found_existing) gop.value_ptr.* = 0;
        gop.value_ptr.* += 1;
    }

    pub fn recordMaintenance(self: *Runtime) void {
        self.maintenance_served += 1;
        self.bumpTimeline(app_io.nowNs());
    }

    pub fn servedCount(self: *const Runtime, text: []const u8) u64 {
        return self.quote_counts.get(quoteKey(text)) orelse 0;
    }

    /// Clear all counters (modes are left untouched).
    pub fn resetStats(self: *Runtime) void {
        self.tcp_served = 0;
        self.udp_served = 0;
        self.maintenance_served = 0;
        self.empty_responses = 0;
        self.http_requests = 0;
        self.api_requests = 0;
        self.auth_failures = 0;
        self.reloads = 0;
        self.last_served_ns = 0;
        self.stats_since_ns = app_io.nowNs();
        self.bucket_counts = @splat(0);
        self.bucket_minute = @splat(-1);
        self.quote_counts.clearRetainingCapacity();
    }
};

pub fn quoteKey(text: []const u8) u64 {
    return std.hash.Wyhash.hash(0, text);
}

/// The shared runtime state.
pub var state: Runtime = .{};

/// What a QOTD server should send for one request.
pub const Reply = struct {
    /// Main payload (quote text or maintenance message), not newline-terminated.
    body: []const u8,
    /// Trailer to send after body: "\n", or debug info followed by "\n".
    trailer: []const u8,
};

/// Decide the QOTD reply for one request and update statistics.
/// Returns null when nothing must be sent (empty store, per contract).
/// `trailer_buf` backs the returned trailer.
pub fn nextReply(
    store: *const quote_store.QuoteStore,
    sel: *selector_mod.Selector,
    proto: Protocol,
    trailer_buf: []u8,
) ?Reply {
    if (state.maintenance) {
        state.recordMaintenance();
        return .{ .body = state.maintenanceMessage(), .trailer = "\n" };
    }

    if (store.isEmpty()) {
        state.empty_responses += 1;
        return null;
    }

    const idx = sel.next() orelse {
        state.empty_responses += 1;
        return null;
    };
    const quote = store.get(idx) orelse {
        state.empty_responses += 1;
        return null;
    };

    state.recordServed(proto, quote);

    if (state.debug) {
        const trailer = std.fmt.bufPrint(
            trailer_buf,
            "\n[debug id={d} mode={s} served={d} quotes={d} proto={s}]\n",
            .{ idx, sel.mode.asString(), state.servedCount(quote), store.count(), @tagName(proto) },
        ) catch "\n";
        return .{ .body = quote, .trailer = trailer };
    }
    return .{ .body = quote, .trailer = "\n" };
}

test "maintenance message defaults and truncation" {
    var rt: Runtime = .{};
    try std.testing.expectEqualStrings(DEFAULT_MAINTENANCE_MESSAGE, rt.maintenanceMessage());
    rt.setMaintenanceMessage("  Back soon  ");
    try std.testing.expectEqualStrings("Back soon", rt.maintenanceMessage());
    rt.setMaintenanceMessage("");
    try std.testing.expectEqualStrings(DEFAULT_MAINTENANCE_MESSAGE, rt.maintenanceMessage());
}

test "served counters and timeline" {
    var rt: Runtime = .{};
    defer rt.quote_counts.deinit(std.heap.c_allocator);
    rt.recordServed(.tcp, "a");
    rt.recordServed(.udp, "a");
    rt.recordServed(.tcp, "b");
    try std.testing.expectEqual(@as(u64, 3), rt.totalServed());
    try std.testing.expectEqual(@as(u64, 2), rt.servedCount("a"));
    try std.testing.expectEqual(@as(u64, 0), rt.servedCount("c"));
    var tl: [TIMELINE_MINUTES]u32 = undefined;
    rt.timeline(&tl);
    try std.testing.expectEqual(@as(u32, 3), tl[TIMELINE_MINUTES - 1]);
    rt.resetStats();
    try std.testing.expectEqual(@as(u64, 0), rt.totalServed());
    try std.testing.expectEqual(@as(u64, 0), rt.servedCount("a"));
}
