const std = @import("std");
const app_io = @import("compat/io.zig");

/// Log level enumeration matching standard severity levels
pub const Level = enum {
    debug,
    info,
    warn,
    err,

    pub fn asString(self: Level) []const u8 {
        return switch (self) {
            .debug => "DEBUG",
            .info => "INFO",
            .warn => "WARN",
            .err => "ERROR",
        };
    }
};

/// Minimum level written to stderr and to the in-memory ring.
/// Raised to .debug at runtime when debug mode is enabled from the backoffice.
pub var min_level: Level = .info;

/// One captured log line, exposed through GET /api/logs.
pub const Entry = struct {
    seq: u64,
    /// Wall-clock milliseconds since the Unix epoch
    ts_ms: i64,
    level: Level,
    len: u16,
    text: [LINE_MAX]u8,

    pub fn message(self: *const Entry) []const u8 {
        return self.text[0..self.len];
    }
};

pub const LINE_MAX = 256;
pub const RING_SIZE = 500;

/// Ring buffer of the most recent log lines (event + fields, no timestamp/level).
pub const Ring = struct {
    entries: [RING_SIZE]Entry = undefined,
    next_seq: u64 = 1,

    pub fn push(self: *Ring, level: Level, ts_ms: i64, line: []const u8) void {
        const seq = self.next_seq;
        self.next_seq += 1;
        const e = &self.entries[@intCast(seq % RING_SIZE)];
        const n = @min(line.len, LINE_MAX);
        e.seq = seq;
        e.ts_ms = ts_ms;
        e.level = level;
        e.len = @intCast(n);
        @memcpy(e.text[0..n], line[0..n]);
    }

    /// Oldest sequence number still held in the ring.
    pub fn oldestSeq(self: *const Ring) u64 {
        if (self.next_seq <= RING_SIZE) return 1;
        return self.next_seq - RING_SIZE;
    }

    pub fn get(self: *const Ring, seq: u64) ?*const Entry {
        if (seq < self.oldestSeq() or seq >= self.next_seq) return null;
        return &self.entries[@intCast(seq % RING_SIZE)];
    }
};

pub var ring: Ring = .{};

fn wallClockMs() i64 {
    var ts: std.c.timespec = undefined;
    _ = std.c.clock_gettime(.REALTIME, &ts);
    return @as(i64, @intCast(ts.sec)) * 1000 + @divTrunc(@as(i64, @intCast(ts.nsec)), 1_000_000);
}

/// Minimal structured logger that writes to stderr via std.debug.print
/// Format: [timestamp] LEVEL event key1=value1 key2=value2
pub const Logger = struct {
    mutex: std.atomic.Mutex = .unlocked,

    /// Initialize logger
    pub fn init() Logger {
        return .{};
    }

    /// Log a structured message with key-value fields
    /// Thread-safe via mutex
    pub fn log(self: *Logger, level: Level, event: []const u8, fields: anytype) void {
        if (@backingInt(level) < @backingInt(min_level)) return;

        while (!self.mutex.tryLock()) std.atomic.spinLoopHint();
        defer self.mutex.unlock();

        var line_buf: [1024]u8 = undefined;
        var w: std.Io.Writer = .fixed(&line_buf);
        w.writeAll(event) catch {};

        // Write structured fields
        const FieldsType = @TypeOf(fields);
        if (@typeInfo(FieldsType) == .@"struct") {
            inline for (@typeInfo(FieldsType).@"struct".field_names) |field_name| {
                const value = @field(fields, field_name);
                w.print(" {s}=", .{field_name}) catch {};
                printValue(&w, value);
            }
        }
        const line = w.buffered();

        const ms = @divTrunc(app_io.nowNs(), 1_000_000);
        std.debug.print("[{d}] {s} {s}\n", .{ ms, level.asString(), line });
        ring.push(level, wallClockMs(), line);
    }

    /// Convenience methods for each log level
    pub fn debug(self: *Logger, event: []const u8, fields: anytype) void {
        self.log(.debug, event, fields);
    }

    pub fn info(self: *Logger, event: []const u8, fields: anytype) void {
        self.log(.info, event, fields);
    }

    pub fn warn(self: *Logger, event: []const u8, fields: anytype) void {
        self.log(.warn, event, fields);
    }

    pub fn err(self: *Logger, event: []const u8, fields: anytype) void {
        self.log(.err, event, fields);
    }
};

/// Print a value with appropriate formatting
fn printValue(w: *std.Io.Writer, value: anytype) void {
    const T = @TypeOf(value);
    const type_info = @typeInfo(T);

    switch (type_info) {
        .int, .comptime_int => w.print("{d}", .{value}) catch {},
        .float, .comptime_float => w.print("{d:.2}", .{value}) catch {},
        .bool => w.print("{}", .{value}) catch {},
        .pointer => |ptr_info| {
            if (ptr_info.size == .slice and ptr_info.child == u8) {
                // String slice ([]const u8)
                w.print("{s}", .{value}) catch {};
            } else if (ptr_info.size == .one) {
                // Pointer to single item - check if it's a pointer to u8 array (string literal)
                const child_info = @typeInfo(ptr_info.child);
                if (child_info == .array and child_info.array.child == u8) {
                    // Pointer to u8 array (e.g., *const [5:0]u8 from "1.0.0")
                    w.print("{s}", .{value}) catch {};
                } else {
                    w.print("{any}", .{value}) catch {};
                }
            } else {
                w.print("{any}", .{value}) catch {};
            }
        },
        .array => |arr_info| {
            if (arr_info.child == u8) {
                // String array
                w.print("{s}", .{value}) catch {};
            } else {
                w.print("{any}", .{value}) catch {};
            }
        },
        .optional => {
            if (value) |v| {
                printValue(w, v);
            } else {
                w.writeAll("null") catch {};
            }
        },
        else => w.print("{any}", .{value}) catch {},
    }
}

// Unit tests
test "logger initialization" {
    const logger = Logger.init();
    _ = logger;
}

test "log level string conversion" {
    try std.testing.expectEqualStrings("DEBUG", Level.debug.asString());
    try std.testing.expectEqualStrings("INFO", Level.info.asString());
    try std.testing.expectEqualStrings("WARN", Level.warn.asString());
    try std.testing.expectEqualStrings("ERROR", Level.err.asString());
}

test "structured logging with various types" {
    var logger = Logger.init();

    // Test with integer
    logger.info("test_event", .{ .count = 42 });

    // Test with string
    logger.info("test_event", .{ .message = "hello" });

    // Test with multiple fields
    logger.info("test_event", .{
        .port = 17,
        .host = "0.0.0.0",
        .enabled = true,
    });

    // Test with optional
    const maybe_value: ?u32 = null;
    logger.info("test_event", .{ .optional = maybe_value });
}

test "all log levels" {
    var logger = Logger.init();

    logger.debug("debug_event", .{ .level = 0 });
    logger.info("info_event", .{ .level = 1 });
    logger.warn("warn_event", .{ .level = 2 });
    logger.err("error_event", .{ .level = 3 });
}

test "ring keeps the most recent lines" {
    var r: Ring = .{};
    var i: usize = 0;
    while (i < RING_SIZE + 5) : (i += 1) r.push(.info, 0, "x");
    try std.testing.expectEqual(@as(u64, 6), r.oldestSeq());
    try std.testing.expect(r.get(5) == null);
    try std.testing.expect(r.get(6) != null);
    try std.testing.expect(r.get(r.next_seq) == null);
}

test "min_level filters lines from the ring" {
    const before = ring.next_seq;
    var l = Logger.init();
    l.debug("filtered_debug_event", .{});
    try std.testing.expectEqual(before, ring.next_seq);
    l.info("kept_info_event", .{ .n = 1 });
    try std.testing.expectEqualStrings("kept_info_event n=1", ring.get(before).?.message());
}
