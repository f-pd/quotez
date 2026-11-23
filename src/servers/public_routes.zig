//! Public, read-only HTTP routes served on the health port without auth:
//!
//!   GET /help          plain-text list of every route
//!   GET /quote         one random quote
//!   GET /n/:num        up to `max_quotes_per_request` distinct random quotes
//!   GET /tags          every tag with its quote count
//!
//! /quote and /n accept `?tag=a,b` (all listed tags must match, the parameter
//! may repeat) and `?author=name` (case-insensitive substring). Every route
//! answers plain text by default and JSON with `?format=json` or an
//! `Accept: application/json` header.
//!
//! RFC 865 itself has no commands or addressing (the server sends one quote
//! and closes), so these routes only exist on the HTTP side.

const std = @import("std");
const quote_store = @import("../quote_store.zig");
const posix_net = @import("../compat/posix_net.zig");

/// Hard cap for /n/:num, larger values are clamped
pub const max_quotes_per_request: usize = 50;

/// Maximum number of tags accepted in one filter
const max_filter_tags = 8;

pub const help_text =
    \\quotez - Quote of the Day (RFC 865)
    \\
    \\QOTD protocol
    \\  TCP/UDP port 17 (standard). Connect (TCP) or send any datagram (UDP)
    \\  and receive one quote. RFC 865 has no commands, paths or addressing:
    \\  anything the client sends is ignored. Filters exist only over HTTP.
    \\
    \\Public HTTP routes (GET, no auth)
    \\  /help             this text
    \\  /quote            one random quote
    \\  /n/:num           :num distinct random quotes (1-50, larger is clamped)
    \\  /tags             all tags with the number of quotes carrying them
    \\  /health           liveness probe
    \\  /ready            readiness probe (503 while no quotes are loaded)
    \\
    \\Query parameters for /quote and /n/:num
    \\  tag=a,b           only quotes carrying every listed tag (repeatable)
    \\  author=name       only quotes whose author contains "name" (case-insensitive)
    \\  format=json       JSON instead of plain text (or send Accept: application/json)
    \\
    \\  Examples: /n/5?tag=stoic   /quote?author=seneca&format=json
    \\
    \\Tags
    \\  Sub-folders of a quote directory become tags
    \\  (quotes/philosophy/stoic/x.txt -> philosophy, stoic). JSON quote objects
    \\  can also set "author", "category" and "tags". Tags are lowercase, spaces
    \\  and underscores become "-".
    \\
    \\Admin API (HTTP Basic auth, only when [api] enabled = true)
    \\  /api/quotes, /api/quotes/:id, /api/status, /api/config,
    \\  /api/reload, /api/maintenance, /api/debug, /api/stats,
    \\  /api/stats/reset, /api/logs
    \\
;

pub const Format = enum { text, json };

/// A response produced by `handle`. `body` is owned by the allocator given to `handle`.
pub const Response = struct {
    status: u16,
    status_text: []const u8,
    content_type: []const u8,
    body: []u8,

    pub fn deinit(self: Response, allocator: std.mem.Allocator) void {
        allocator.free(self.body);
    }
};

/// Parsed /quote and /n filter
const Filter = struct {
    tag_bufs: [max_filter_tags][quote_store.max_tag_len]u8 = undefined,
    tags: [max_filter_tags][]const u8 = undefined,
    tag_count: usize = 0,
    author_buf: [128]u8 = undefined,
    author: ?[]const u8 = null,
    too_many_tags: bool = false,

    fn addTags(self: *Filter, raw_list: []const u8) void {
        var it = std.mem.splitScalar(u8, raw_list, ',');
        while (it.next()) |raw| {
            if (self.tag_count >= max_filter_tags) {
                self.too_many_tags = true;
                return;
            }
            const tag = quote_store.normalizeTag(raw, &self.tag_bufs[self.tag_count]);
            if (tag.len == 0) continue;
            self.tags[self.tag_count] = tag;
            self.tag_count += 1;
        }
    }

    fn matches(self: *const Filter, q: *const quote_store.Quote) bool {
        for (self.tags[0..self.tag_count]) |tag| {
            if (!q.hasTag(tag)) return false;
        }
        if (self.author) |needle| {
            const hay = q.author orelse inferAuthor(q.content) orelse return false;
            if (std.ascii.findIgnoreCase(hay, needle) == null) return false;
        }
        return true;
    }
};

/// Best effort author for plain-text quotes written as "Text - Author"
fn inferAuthor(content: []const u8) ?[]const u8 {
    const seps = [_][]const u8{ " — ", " – ", " - " };
    for (seps) |sep| {
        if (std.mem.lastIndexOf(u8, content, sep)) |pos| {
            const author = std.mem.trim(u8, content[pos + sep.len ..], " ");
            if (author.len > 0 and author.len <= 80) return author;
        }
    }
    return null;
}

/// Handle a public route. Returns null when `target` is not a public route,
/// so the caller can continue with its own routing.
pub fn handle(
    allocator: std.mem.Allocator,
    store: *const quote_store.QuoteStore,
    random: std.Random,
    method: []const u8,
    target: []const u8,
    request: []const u8,
) !?Response {
    const qpos = std.mem.indexOfScalar(u8, target, '?');
    var path = if (qpos) |p| target[0..p] else target;
    const query = if (qpos) |p| target[p + 1 ..] else "";
    if (path.len > 1 and path[path.len - 1] == '/') path = path[0 .. path.len - 1];

    const Route = enum { help, quote, n, tags };
    const route: Route = if (std.mem.eql(u8, path, "/help"))
        .help
    else if (std.mem.eql(u8, path, "/quote"))
        .quote
    else if (std.mem.eql(u8, path, "/n") or std.mem.startsWith(u8, path, "/n/"))
        .n
    else if (std.mem.eql(u8, path, "/tags"))
        .tags
    else
        return null;

    const format = detectFormat(query, request);

    if (!std.mem.eql(u8, method, "GET")) {
        return try errorResponse(allocator, format, 405, "Method Not Allowed", "Only GET is supported");
    }

    switch (route) {
        .help => return .{
            .status = 200,
            .status_text = "OK",
            .content_type = "text/plain; charset=utf-8",
            .body = try allocator.dupe(u8, help_text),
        },
        .tags => return try tagsResponse(allocator, store, format),
        .quote, .n => {
            var requested: usize = 1;
            if (route == .n) {
                const num_str = if (path.len > "/n/".len) path["/n/".len..] else "";
                requested = std.fmt.parseInt(usize, num_str, 10) catch 0;
                if (requested == 0) {
                    return try errorResponse(allocator, format, 400, "Bad Request", "Use /n/:num with a number from 1 to 50");
                }
            }

            var filter: Filter = .{};
            var params = std.mem.splitScalar(u8, query, '&');
            while (params.next()) |param| {
                const eq = std.mem.indexOfScalar(u8, param, '=') orelse continue;
                const key = param[0..eq];
                var value_buf: [256]u8 = undefined;
                const value = percentDecode(param[eq + 1 ..], &value_buf);
                if (std.mem.eql(u8, key, "tag") or std.mem.eql(u8, key, "tags")) {
                    filter.addTags(value);
                } else if (std.mem.eql(u8, key, "author")) {
                    const trimmed = std.mem.trim(u8, value, " ");
                    if (trimmed.len > 0) {
                        const len = @min(trimmed.len, filter.author_buf.len);
                        @memcpy(filter.author_buf[0..len], trimmed[0..len]);
                        filter.author = filter.author_buf[0..len];
                    }
                }
            }
            if (filter.too_many_tags) {
                return try errorResponse(allocator, format, 400, "Bad Request", "Too many tags (max 8)");
            }

            if (store.isEmpty()) {
                return try errorResponse(allocator, format, 503, "Service Unavailable", "No quotes loaded");
            }

            var matching: std.ArrayList(usize) = .empty;
            defer matching.deinit(allocator);
            for (store.quotes.items, 0..) |*q, i| {
                if (filter.matches(q)) try matching.append(allocator, i);
            }
            if (matching.items.len == 0) {
                return try errorResponse(allocator, format, 404, "Not Found", "No quotes match the filter");
            }

            // Partial Fisher-Yates: the first `k` items become a random distinct sample
            const capped = @min(requested, max_quotes_per_request);
            const k = @min(capped, matching.items.len);
            for (0..k) |i| {
                const j = i + random.uintLessThan(usize, matching.items.len - i);
                std.mem.swap(usize, &matching.items[i], &matching.items[j]);
            }

            return try quotesResponse(allocator, store, matching.items[0..k], format, route == .quote, requested, matching.items.len);
        },
    }
}

fn detectFormat(query: []const u8, request: []const u8) Format {
    var params = std.mem.splitScalar(u8, query, '&');
    while (params.next()) |param| {
        if (std.mem.eql(u8, param, "format=json")) return .json;
        if (std.mem.eql(u8, param, "format=text")) return .text;
    }
    const headers_end = std.mem.indexOf(u8, request, "\r\n\r\n") orelse request.len;
    var lines = std.mem.splitSequence(u8, request[0..headers_end], "\r\n");
    while (lines.next()) |line| {
        if (line.len > 7 and std.ascii.eqlIgnoreCase(line[0..7], "accept:")) {
            if (std.mem.indexOf(u8, line, "application/json") != null) return .json;
        }
    }
    return .text;
}

/// Decode %XX and '+' into `out` (truncates silently when `out` is full)
fn percentDecode(input: []const u8, out: []u8) []const u8 {
    var i: usize = 0;
    var n: usize = 0;
    while (i < input.len and n < out.len) {
        const c = input[i];
        if (c == '+') {
            out[n] = ' ';
            i += 1;
        } else if (c == '%' and i + 3 <= input.len) {
            if (std.fmt.parseInt(u8, input[i + 1 .. i + 3], 16)) |byte| {
                out[n] = byte;
                i += 3;
            } else |_| {
                out[n] = '%';
                i += 1;
            }
        } else {
            out[n] = c;
            i += 1;
        }
        n += 1;
    }
    return out[0..n];
}

fn appendJsonString(buf: *std.ArrayList(u8), allocator: std.mem.Allocator, s: []const u8) !void {
    try buf.append(allocator, '"');
    for (s) |c| {
        switch (c) {
            '"' => try buf.appendSlice(allocator, "\\\""),
            '\\' => try buf.appendSlice(allocator, "\\\\"),
            '\n' => try buf.appendSlice(allocator, "\\n"),
            '\r' => try buf.appendSlice(allocator, "\\r"),
            '\t' => try buf.appendSlice(allocator, "\\t"),
            0...8, 11, 12, 14...0x1f => {
                var esc: [6]u8 = undefined;
                try buf.appendSlice(allocator, try std.fmt.bufPrint(&esc, "\\u{x:0>4}", .{c}));
            },
            else => try buf.append(allocator, c),
        }
    }
    try buf.append(allocator, '"');
}

fn appendQuoteJson(buf: *std.ArrayList(u8), allocator: std.mem.Allocator, q: *const quote_store.Quote) !void {
    try buf.appendSlice(allocator, "{\"text\":");
    try appendJsonString(buf, allocator, q.content);
    try buf.appendSlice(allocator, ",\"author\":");
    if (q.author) |a| try appendJsonString(buf, allocator, a) else try buf.appendSlice(allocator, "null");
    try buf.appendSlice(allocator, ",\"tags\":[");
    for (q.tags, 0..) |t, i| {
        if (i > 0) try buf.append(allocator, ',');
        try appendJsonString(buf, allocator, t);
    }
    try buf.appendSlice(allocator, "]}");
}

/// Plain-text line: content, plus " - author" when the author is known and not already in the text
fn appendQuoteText(buf: *std.ArrayList(u8), allocator: std.mem.Allocator, q: *const quote_store.Quote) !void {
    try buf.appendSlice(allocator, q.content);
    if (q.author) |a| {
        if (std.mem.indexOf(u8, q.content, a) == null) {
            try buf.appendSlice(allocator, " - ");
            try buf.appendSlice(allocator, a);
        }
    }
    try buf.append(allocator, '\n');
}

fn quotesResponse(
    allocator: std.mem.Allocator,
    store: *const quote_store.QuoteStore,
    picks: []const usize,
    format: Format,
    single: bool,
    requested: usize,
    matching: usize,
) !Response {
    var buf: std.ArrayList(u8) = .empty;
    errdefer buf.deinit(allocator);

    switch (format) {
        .text => for (picks) |idx| try appendQuoteText(&buf, allocator, store.getQuote(idx).?),
        .json => if (single) {
            try appendQuoteJson(&buf, allocator, store.getQuote(picks[0]).?);
        } else {
            var head: [160]u8 = undefined;
            try buf.appendSlice(allocator, try std.fmt.bufPrint(
                &head,
                "{{\"requested\":{d},\"count\":{d},\"matching\":{d},\"max\":{d},\"quotes\":[",
                .{ requested, picks.len, matching, max_quotes_per_request },
            ));
            for (picks, 0..) |idx, i| {
                if (i > 0) try buf.append(allocator, ',');
                try appendQuoteJson(&buf, allocator, store.getQuote(idx).?);
            }
            try buf.appendSlice(allocator, "]}");
        },
    }

    return .{
        .status = 200,
        .status_text = "OK",
        .content_type = contentType(format),
        .body = try buf.toOwnedSlice(allocator),
    };
}

fn tagsResponse(allocator: std.mem.Allocator, store: *const quote_store.QuoteStore, format: Format) !Response {
    var counts: std.StringArrayHashMapUnmanaged(usize) = .empty;
    defer counts.deinit(allocator);
    var untagged: usize = 0;
    for (store.quotes.items) |q| {
        if (q.tags.len == 0) untagged += 1;
        for (q.tags) |t| {
            const gop = try counts.getOrPut(allocator, t);
            gop.value_ptr.* = if (gop.found_existing) gop.value_ptr.* + 1 else 1;
        }
    }

    const SortCtx = struct {
        keys: []const []const u8,
        pub fn lessThan(ctx: @This(), a: usize, b: usize) bool {
            return std.mem.lessThan(u8, ctx.keys[a], ctx.keys[b]);
        }
    };
    counts.sort(SortCtx{ .keys = counts.keys() });

    var buf: std.ArrayList(u8) = .empty;
    errdefer buf.deinit(allocator);
    var num: [64]u8 = undefined;

    switch (format) {
        .text => {
            for (counts.keys(), counts.values()) |tag, n| {
                try buf.appendSlice(allocator, tag);
                try buf.appendSlice(allocator, try std.fmt.bufPrint(&num, "\t{d}\n", .{n}));
            }
        },
        .json => {
            try buf.appendSlice(allocator, "{\"tags\":[");
            for (counts.keys(), counts.values(), 0..) |tag, n, i| {
                if (i > 0) try buf.append(allocator, ',');
                try buf.appendSlice(allocator, "{\"tag\":");
                try appendJsonString(&buf, allocator, tag);
                try buf.appendSlice(allocator, try std.fmt.bufPrint(&num, ",\"count\":{d}}}", .{n}));
            }
            try buf.appendSlice(allocator, try std.fmt.bufPrint(&num, "],\"untagged\":{d}}}", .{untagged}));
        },
    }

    return .{
        .status = 200,
        .status_text = "OK",
        .content_type = contentType(format),
        .body = try buf.toOwnedSlice(allocator),
    };
}

fn contentType(format: Format) []const u8 {
    return switch (format) {
        .text => "text/plain; charset=utf-8",
        .json => "application/json",
    };
}

fn errorResponse(allocator: std.mem.Allocator, format: Format, status: u16, status_text: []const u8, message: []const u8) !Response {
    const body = switch (format) {
        .text => try std.fmt.allocPrint(allocator, "{s}\n", .{message}),
        .json => try std.fmt.allocPrint(allocator, "{{\"error\":\"{s}\",\"code\":{d}}}", .{ message, status }),
    };
    return .{ .status = status, .status_text = status_text, .content_type = contentType(format), .body = body };
}

/// Write the whole response, looping over partial sends (bodies can exceed one send)
pub fn send(client_fd: std.posix.socket_t, resp: Response) !void {
    var head_buf: [256]u8 = undefined;
    const head = try std.fmt.bufPrint(
        &head_buf,
        "HTTP/1.1 {d} {s}\r\nContent-Type: {s}\r\nContent-Length: {d}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        .{ resp.status, resp.status_text, resp.content_type, resp.body.len },
    );
    try sendAll(client_fd, head);
    try sendAll(client_fd, resp.body);
}

fn sendAll(client_fd: std.posix.socket_t, data: []const u8) !void {
    var sent: usize = 0;
    while (sent < data.len) {
        sent += try posix_net.send(client_fd, data[sent..], 0);
    }
}

// Tests

fn testStore(allocator: std.mem.Allocator) !quote_store.QuoteStore {
    var store = quote_store.QuoteStore.init(allocator);
    errdefer store.deinit();
    const stoic = [_][]const u8{ "philosophy", "stoic" };
    const greek = [_][]const u8{"philosophy"};
    try store.quotes.append(allocator, try quote_store.Quote.initWithMeta(allocator, "Luck is preparation.", null, "Seneca", &stoic));
    try store.quotes.append(allocator, try quote_store.Quote.initWithMeta(allocator, "Waste no more time. - Marcus Aurelius", null, null, &stoic));
    try store.quotes.append(allocator, try quote_store.Quote.initWithMeta(allocator, "Know thyself.", null, null, &greek));
    try store.quotes.append(allocator, try quote_store.Quote.init(allocator, "Untagged \"quote\".", null));
    return store;
}

fn testHandle(store: *const quote_store.QuoteStore, method: []const u8, target: []const u8, request: []const u8) !?Response {
    var prng = std.Random.DefaultPrng.init(42);
    return handle(std.testing.allocator, store, prng.random(), method, target, request);
}

test "public routes - unknown path falls through" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();
    try std.testing.expect((try testHandle(&store, "GET", "/api/quotes", "")) == null);
    try std.testing.expect((try testHandle(&store, "GET", "/nope", "")) == null);
}

test "public routes - help" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();
    const resp = (try testHandle(&store, "GET", "/help", "")).?;
    defer resp.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(u16, 200), resp.status);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "/n/:num") != null);
}

test "public routes - method not allowed" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();
    const resp = (try testHandle(&store, "POST", "/quote", "")).?;
    defer resp.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(u16, 405), resp.status);
}

test "public routes - /n returns distinct quotes and clamps" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();

    const resp = (try testHandle(&store, "GET", "/n/1000", "")).?;
    defer resp.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(u16, 200), resp.status);
    // Only 4 quotes exist: all of them, once each
    try std.testing.expectEqual(@as(usize, 4), std.mem.count(u8, resp.body, "\n"));
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "Know thyself.") != null);
    try std.testing.expect(std.mem.indexOf(u8, resp.body, "Luck is preparation. - Seneca") != null);

    const two = (try testHandle(&store, "GET", "/n/2", "")).?;
    defer two.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, two.body, "\n"));
}

test "public routes - /n rejects bad numbers" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();
    for ([_][]const u8{ "/n/0", "/n/abc", "/n/", "/n/-3" }) |target| {
        const resp = (try testHandle(&store, "GET", target, "")).?;
        defer resp.deinit(std.testing.allocator);
        try std.testing.expectEqual(@as(u16, 400), resp.status);
    }
}

test "public routes - tag and author filters" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();

    const stoic = (try testHandle(&store, "GET", "/n/10?tag=Stoic", "")).?;
    defer stoic.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, stoic.body, "\n"));
    try std.testing.expect(std.mem.indexOf(u8, stoic.body, "Know thyself") == null);

    const both = (try testHandle(&store, "GET", "/n/10?tag=philosophy&tag=stoic", "")).?;
    defer both.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, both.body, "\n"));

    // author inferred from "Text - Author" for plain quotes
    const marcus = (try testHandle(&store, "GET", "/quote?author=marcus%20aurelius", "")).?;
    defer marcus.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings("Waste no more time. - Marcus Aurelius\n", marcus.body);

    const none = (try testHandle(&store, "GET", "/quote?tag=missing", "")).?;
    defer none.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(u16, 404), none.status);
}

test "public routes - json format" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();

    const one = (try testHandle(&store, "GET", "/quote?author=seneca&format=json", "")).?;
    defer one.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings("application/json", one.content_type);
    try std.testing.expectEqualStrings(
        "{\"text\":\"Luck is preparation.\",\"author\":\"Seneca\",\"tags\":[\"philosophy\",\"stoic\"]}",
        one.body,
    );

    const many = (try testHandle(&store, "GET", "/n/2", "GET /n/2 HTTP/1.1\r\nAccept: application/json\r\n\r\n")).?;
    defer many.deinit(std.testing.allocator);
    const parsed = try std.json.parseFromSlice(std.json.Value, std.testing.allocator, many.body, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(@as(usize, 2), parsed.value.object.get("quotes").?.array.items.len);
    try std.testing.expectEqual(@as(i64, 4), parsed.value.object.get("matching").?.integer);
}

test "public routes - tags listing" {
    var store = try testStore(std.testing.allocator);
    defer store.deinit();

    const text = (try testHandle(&store, "GET", "/tags", "")).?;
    defer text.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings("philosophy\t3\nstoic\t2\n", text.body);

    const json = (try testHandle(&store, "GET", "/tags?format=json", "")).?;
    defer json.deinit(std.testing.allocator);
    try std.testing.expectEqualStrings(
        "{\"tags\":[{\"tag\":\"philosophy\",\"count\":3},{\"tag\":\"stoic\",\"count\":2}],\"untagged\":1}",
        json.body,
    );
}

test "public routes - empty store" {
    var store = quote_store.QuoteStore.init(std.testing.allocator);
    defer store.deinit();
    const resp = (try testHandle(&store, "GET", "/quote", "")).?;
    defer resp.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(u16, 503), resp.status);
}

test "percentDecode" {
    var buf: [64]u8 = undefined;
    try std.testing.expectEqualStrings("a b c", percentDecode("a%20b+c", &buf));
    try std.testing.expectEqualStrings("100%", percentDecode("100%", &buf));
    try std.testing.expectEqualStrings("%zz", percentDecode("%zz", &buf));
}
