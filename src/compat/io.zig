const std = @import("std");

pub var value: std.Io = if (@import("builtin").is_test) std.testing.io else undefined;

pub fn nowNs() i128 {
    var ts: std.c.timespec = undefined;
    _ = std.c.clock_gettime(.MONOTONIC, &ts);
    return @as(i128, @intCast(ts.sec)) * std.time.ns_per_s + @as(i128, @intCast(ts.nsec));
}
