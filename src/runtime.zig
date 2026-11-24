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
const config = @import("config.zig");
const i18n = @import("i18n.zig");

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

    // Quote languages from the [locales] config section (borrowed, set at startup)
    locales: []const []const u8 = &config.Configuration.Defaults.locales,
    default_locale: []const u8 = config.Configuration.Defaults.default_locale,

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
    /// Payloads (quote texts or one maintenance/info message), not newline-terminated.
    /// Each one is sent followed by "\n"; the trailer goes after the last one.
    bodies: [i18n.qotd_max_count][]const u8 = undefined,
    count: usize = 0,
    /// Trailer to send after the last body: "\n", or debug info followed by "\n".
    trailer: []const u8 = "\n",

    /// First payload (the only one for a standard RFC 865 reply)
    pub fn body(self: *const Reply) []const u8 {
        return self.bodies[0];
    }

    fn push(self: *Reply, text: []const u8) void {
        self.bodies[self.count] = text;
        self.count += 1;
    }
};

/// Help for the QOTD extension (kept under the RFC 865 size limit)
fn qotdHelp(buf: []u8) []const u8 {
    var langs: [96]u8 = undefined;
    var n: usize = 0;
    for (state.locales) |l| {
        if (n + l.len + 1 > langs.len) break;
        if (n > 0) {
            langs[n] = ' ';
            n += 1;
        }
        @memcpy(langs[n..][0..l.len], l);
        n += l.len;
    }
    return std.fmt.bufPrint(buf,
        \\quotez - Quote of the Day (RFC 865)
        \\Send nothing: one quote in its original language.
        \\Or send one line right after connecting:
        \\  help | ?        this text
        \\  <lang>          one quote in a language
        \\  n <count>       up to {d} quotes
        \\  <lang> n <count>
        \\Languages: {s} (also it-IT, fr-FR...)
        \\Examples:
        \\  echo it | nc HOST 17
        \\  echo "fr n 3" | nc HOST 17
        \\  echo en | nc -u -w1 HOST 17
        \\More, with filters, over HTTP: /help
    , .{ i18n.qotd_max_count, langs[0..n] }) catch "quotez: send \"it\", \"fr n 3\" or nothing";
}

var qotd_prng: ?std.Random.DefaultPrng = null;

fn qotdRandom() std.Random {
    if (qotd_prng == null) qotd_prng = std.Random.DefaultPrng.init(@truncate(@as(u128, @bitCast(app_io.nowNs()))));
    return qotd_prng.?.random();
}

/// Decide the QOTD reply for one request and update statistics.
/// `request` is the optional extension parsed from what the client sent
/// (null or a plain request gives the standard RFC 865 reply).
/// Returns null when nothing must be sent (empty store, per contract).
/// Texts longer than `i18n.qotd_max_bytes` are web only and never selected.
/// `msg_buf` backs informational messages, `trailer_buf` the trailer.
pub fn nextReply(
    store: *const quote_store.QuoteStore,
    sel: *selector_mod.Selector,
    proto: Protocol,
    request: ?*const i18n.QotdRequest,
    msg_buf: []u8,
    trailer_buf: []u8,
) ?Reply {
    var reply: Reply = .{};
    if (request) |r| {
        if (r.help) {
            reply.push(qotdHelp(msg_buf));
            return reply;
        }
    }
    if (state.maintenance) {
        state.recordMaintenance();
        reply.push(state.maintenanceMessage());
        return reply;
    }

    if (store.isEmpty()) {
        state.empty_responses += 1;
        return null;
    }

    const locale: ?[]const u8 = if (request) |r| r.locale() else null;
    const wanted: usize = if (request) |r| r.count else 1;

    var first_idx: usize = 0;
    if (locale == null and wanted == 1) {
        // Standard reply: honour the selection mode, skipping web-only quotes
        var attempts: usize = 0;
        while (attempts < store.count()) : (attempts += 1) {
            const idx = sel.next() orelse break;
            const q = store.getQuote(idx) orelse continue;
            if (!i18n.fitsQotd(q.content)) continue;
            first_idx = idx;
            reply.push(q.content);
            break;
        }
        if (reply.count == 0) {
            state.empty_responses += 1;
            return null;
        }
    } else {
        if (locale) |loc| {
            if (!i18n.isSupported(state.locales, loc)) {
                state.empty_responses += 1;
                reply.push(std.fmt.bufPrint(msg_buf, "Unsupported locale: {s}", .{loc}) catch "Unsupported locale");
                return reply;
            }
        }
        // Random distinct sample among the quotes that have a text in the
        // requested language (never another language) that fits RFC 865.
        const Pick = struct { idx: usize, text: []const u8 };
        var picks: [i18n.qotd_max_count]Pick = undefined;
        var seen: usize = 0; // eligible quotes seen so far (reservoir sampling)
        const random = qotdRandom();
        for (store.quotes.items, 0..) |*q, idx| {
            const text = if (locale) |loc| blk: {
                const r = q.resolve(loc, state.default_locale) orelse continue;
                break :blk r.text;
            } else q.content;
            if (!i18n.fitsQotd(text)) continue;
            if (seen < wanted) {
                picks[seen] = .{ .idx = idx, .text = text };
            } else {
                const j = random.uintLessThan(usize, seen + 1);
                if (j < wanted) picks[j] = .{ .idx = idx, .text = text };
            }
            seen += 1;
        }
        const n = @min(seen, wanted);
        if (n == 0) {
            state.empty_responses += 1;
            reply.push(std.fmt.bufPrint(msg_buf, "No quotes available in {s}", .{locale orelse "this language"}) catch "No quotes available");
            return reply;
        }
        // Shuffle so the reservoir order is not biased towards early quotes
        random.shuffle(Pick, picks[0..n]);
        for (picks[0..n]) |p| reply.push(p.text);
        first_idx = picks[0].idx;
    }

    for (reply.bodies[0..reply.count]) |t| state.recordServed(proto, t);

    if (state.debug) {
        reply.trailer = std.fmt.bufPrint(
            trailer_buf,
            "\n[debug id={d} mode={s} served={d} quotes={d} proto={s} lang={s}]\n",
            .{ first_idx, sel.mode.asString(), state.servedCount(reply.body()), store.count(), @tagName(proto), locale orelse "original" },
        ) catch "\n";
    }
    return reply;
}

fn testLocaleStore(allocator: std.mem.Allocator) !quote_store.QuoteStore {
    var store = quote_store.QuoteStore.init(allocator);
    errdefer store.deinit();
    const T = quote_store.Translation;
    try store.quotes.append(allocator, try quote_store.Quote.initFull(allocator, "Fatti non foste a viver come bruti", null, "Dante", &.{}, "it", &[_]T{
        .{ .lang = "en", .text = "You were not made to live as brutes" },
    }));
    try store.quotes.append(allocator, try quote_store.Quote.init(allocator, "Well begun is half done.", null));
    // Web only: longer than the RFC 865 limit
    const long: [i18n.qotd_max_bytes + 1]u8 = @splat('x');
    try store.quotes.append(allocator, try quote_store.Quote.initFull(allocator, &long, null, null, &.{}, "fr", &.{}));
    return store;
}

test "nextReply honours locale, count and the RFC 865 size limit" {
    const allocator = std.testing.allocator;
    var store = try testLocaleStore(allocator);
    defer store.deinit();
    var sel = try selector_mod.Selector.init(allocator, .sequential, store.count());
    defer sel.deinit();
    defer {
        state.quote_counts.deinit(std.heap.c_allocator);
        state.quote_counts = .empty;
    }
    var msg: [128]u8 = undefined;
    var trailer: [256]u8 = undefined;

    // Plain requests never pick the web-only quote
    for (0..6) |_| {
        const r = nextReply(&store, &sel, .tcp, null, &msg, &trailer).?;
        try std.testing.expectEqual(@as(usize, 1), r.count);
        try std.testing.expect(r.body().len <= i18n.qotd_max_bytes);
    }

    var req = i18n.parseQotdRequest("it-IT");
    var r = nextReply(&store, &sel, .tcp, &req, &msg, &trailer).?;
    try std.testing.expectEqualStrings("Fatti non foste a viver come bruti", r.body());

    req = i18n.parseQotdRequest("en n 5");
    r = nextReply(&store, &sel, .udp, &req, &msg, &trailer).?;
    try std.testing.expectEqual(@as(usize, 2), r.count);

    // fr exists only as a web-only quote: an info line, never another language
    req = i18n.parseQotdRequest("fr");
    r = nextReply(&store, &sel, .tcp, &req, &msg, &trailer).?;
    try std.testing.expectEqualStrings("No quotes available in fr", r.body());

    req = i18n.parseQotdRequest("help");
    var help_buf: [512]u8 = undefined;
    r = nextReply(&store, &sel, .tcp, &req, &help_buf, &trailer).?;
    try std.testing.expect(std.mem.indexOf(u8, r.body(), "Languages: en it fr") != null);
    try std.testing.expect(r.body().len <= i18n.qotd_max_bytes);

    req = i18n.parseQotdRequest("de");
    r = nextReply(&store, &sel, .tcp, &req, &msg, &trailer).?;
    try std.testing.expectEqualStrings("Unsupported locale: de", r.body());
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
