const std = @import("std");
const parser = @import("parser.zig");

/// Parse JSON format: array of strings, object with "quotes" array, or array of objects with "quote"/"text" field
/// Objects may also carry metadata: "author" (string), "category" (string)
/// and "tags" (array of strings or comma-separated string), "lang" (original
/// language, BCP 47 such as "it" or "it-IT") and "translations": either an
/// object {"en": "text", "fr": "texte"} or an array [{"lang": "en", "text": "..."}],
/// and "work" (also "reference"/"citation"): the book or speech it comes from.
pub fn parse(allocator: std.mem.Allocator, content: []const u8) !parser.ParseResult {
    var quotes: std.ArrayList([]const u8) = .empty;
    var metas: std.ArrayList(parser.QuoteMeta) = .empty;
    errdefer {
        for (quotes.items) |quote| allocator.free(quote);
        quotes.deinit(allocator);
        for (metas.items) |m| m.deinit(allocator);
        metas.deinit(allocator);
    }

    // Parse JSON
    const parsed = std.json.parseFromSlice(std.json.Value, allocator, content, .{}) catch |err| {
        return switch (err) {
            error.UnexpectedEndOfInput, error.SyntaxError => parser.ParserError.MalformedFormat,
            else => err,
        };
    };
    defer parsed.deinit();

    const root = parsed.value;

    // Try different JSON structures
    switch (root) {
        .array => |arr| {
            // Could be array of strings or array of objects
            for (arr.items) |item| try appendItem(allocator, &quotes, &metas, item);
        },
        .object => |obj| {
            // Look for "quotes" key containing an array (strings or objects)
            if (obj.get("quotes")) |quotes_val| {
                if (quotes_val == .array) {
                    for (quotes_val.array.items) |item| try appendItem(allocator, &quotes, &metas, item);
                }
            }
        },
        else => {
            return parser.ParserError.UnsupportedStructure;
        },
    }

    if (quotes.items.len == 0) {
        return parser.ParserError.EmptyFile;
    }

    return parser.ParseResult{
        .quotes = quotes,
        .format = .json,
        .metas = metas,
    };
}

/// Append one JSON array item (string or object) keeping `metas` parallel to `quotes`
fn appendItem(
    allocator: std.mem.Allocator,
    quotes: *std.ArrayList([]const u8),
    metas: *std.ArrayList(parser.QuoteMeta),
    item: std.json.Value,
) !void {
    switch (item) {
        .string => |str| {
            const normalized = (try parser.normalizeQuote(allocator, str)) orelse return;
            errdefer allocator.free(normalized);
            try metas.ensureUnusedCapacity(allocator, 1);
            try quotes.append(allocator, normalized);
            metas.appendAssumeCapacity(.{});
        },
        .object => |obj| {
            // Try to extract "quote" or "text" field
            const text_val = obj.get("quote") orelse obj.get("text") orelse return;
            if (text_val != .string) return;
            const normalized = (try parser.normalizeQuote(allocator, text_val.string)) orelse return;
            errdefer allocator.free(normalized);

            const meta = try extractMeta(allocator, obj);
            errdefer meta.deinit(allocator);

            try metas.ensureUnusedCapacity(allocator, 1);
            try quotes.append(allocator, normalized);
            metas.appendAssumeCapacity(meta);
        },
        else => {}, // Ignore non-string, non-object items
    }
}

/// Read "author", "category" and "tags" from a quote object
fn extractMeta(allocator: std.mem.Allocator, obj: std.json.ObjectMap) !parser.QuoteMeta {
    var tags: std.ArrayList([]const u8) = .empty;
    errdefer {
        for (tags.items) |t| allocator.free(t);
        tags.deinit(allocator);
    }

    if (obj.get("category")) |cat| {
        if (cat == .string and std.mem.trim(u8, cat.string, " \t").len > 0) {
            try tags.append(allocator, try allocator.dupe(u8, cat.string));
        }
    }
    if (obj.get("tags")) |tags_val| {
        switch (tags_val) {
            .array => |arr| for (arr.items) |t| {
                if (t == .string) try tags.append(allocator, try allocator.dupe(u8, t.string));
            },
            .string => |str| {
                var it = std.mem.splitScalar(u8, str, ',');
                while (it.next()) |t| try tags.append(allocator, try allocator.dupe(u8, t));
            },
            else => {},
        }
    }

    var author: ?[]const u8 = null;
    if (obj.get("author")) |a| {
        if (a == .string) {
            const trimmed = std.mem.trim(u8, a.string, " \t\r\n");
            if (trimmed.len > 0) author = try allocator.dupe(u8, trimmed);
        }
    }
    errdefer if (author) |a| allocator.free(a);

    var lang: ?[]const u8 = null;
    if (obj.get("lang") orelse obj.get("language")) |l| {
        if (l == .string) {
            const trimmed = std.mem.trim(u8, l.string, " \t\r\n");
            if (trimmed.len > 0) lang = try allocator.dupe(u8, trimmed);
        }
    }
    errdefer if (lang) |l| allocator.free(l);

    var work: ?[]const u8 = null;
    if (obj.get("work") orelse obj.get("reference") orelse obj.get("citation")) |w| {
        if (w == .string) {
            const trimmed = std.mem.trim(u8, w.string, " \t\r\n");
            if (trimmed.len > 0) work = try allocator.dupe(u8, trimmed);
        }
    }
    errdefer if (work) |w| allocator.free(w);

    var translations: std.ArrayList(parser.Translation) = .empty;
    errdefer {
        for (translations.items) |t| {
            allocator.free(t.lang);
            allocator.free(t.text);
        }
        translations.deinit(allocator);
    }
    if (obj.get("translations")) |tr| {
        switch (tr) {
            .object => |map| {
                var it = map.iterator();
                while (it.next()) |entry| {
                    if (entry.value_ptr.* != .string) continue;
                    try appendTranslation(allocator, &translations, entry.key_ptr.*, entry.value_ptr.string);
                }
            },
            .array => |arr| for (arr.items) |item| {
                if (item != .object) continue;
                const l = item.object.get("lang") orelse item.object.get("language") orelse continue;
                const t = item.object.get("text") orelse item.object.get("quote") orelse continue;
                if (l != .string or t != .string) continue;
                try appendTranslation(allocator, &translations, l.string, t.string);
            },
            else => {},
        }
    }

    return .{
        .work = work,
        .lang = lang,
        .translations = if (translations.items.len == 0) blk: {
            translations.deinit(allocator);
            break :blk &.{};
        } else try translations.toOwnedSlice(allocator),
        .author = author,
        .tags = if (tags.items.len == 0) blk: {
            tags.deinit(allocator);
            break :blk &.{};
        } else try tags.toOwnedSlice(allocator),
    };
}

fn appendTranslation(allocator: std.mem.Allocator, list: *std.ArrayList(parser.Translation), lang: []const u8, text: []const u8) !void {
    const normalized = (try parser.normalizeQuote(allocator, text)) orelse return;
    errdefer allocator.free(normalized);
    const owned_lang = try allocator.dupe(u8, lang);
    errdefer allocator.free(owned_lang);
    try list.append(allocator, .{ .lang = owned_lang, .text = normalized });
}

pub const jsonParser = parser.Parser{
    .parseFn = parse,
};

// Tests
test "json - language and translations" {
    const allocator = std.testing.allocator;
    const content =
        \\[
        \\  {"quote": "Nel mezzo del cammin di nostra vita", "author": "Dante", "lang": "it", "work": "Inferno I, 1",
        \\   "translations": {"en": "Midway upon the journey of our life", "fr": "Au milieu du chemin de notre vie"}},
        \\  {"text": "Carpe diem", "language": "la", "translations": [{"lang": "it-IT", "text": "Cogli l'attimo"}]}
        \\]
    ;
    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    const m0 = result.meta(0);
    try std.testing.expectEqualStrings("it", m0.lang.?);
    try std.testing.expectEqualStrings("Inferno I, 1", m0.work.?);
    try std.testing.expectEqual(@as(usize, 2), m0.translations.len);
    const m1 = result.meta(1);
    try std.testing.expectEqualStrings("la", m1.lang.?);
    try std.testing.expectEqualStrings("it-IT", m1.translations[0].lang);
    try std.testing.expectEqualStrings("Cogli l'attimo", m1.translations[0].text);
}

test "json - metadata: author, category and tags" {
    const allocator = std.testing.allocator;
    const content =
        \\[
        \\  {"quote": "First", "author": "Seneca", "category": "Stoicism", "tags": ["time", "life"]},
        \\  "Plain string",
        \\  {"text": "Third", "tags": "a, b"}
        \\]
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 3), result.quotes.items.len);
    try std.testing.expectEqual(@as(usize, 3), result.metas.items.len);

    const m0 = result.meta(0);
    try std.testing.expectEqualStrings("Seneca", m0.author.?);
    try std.testing.expectEqual(@as(usize, 3), m0.tags.len);
    try std.testing.expectEqualStrings("Stoicism", m0.tags[0]);
    try std.testing.expectEqualStrings("life", m0.tags[2]);

    try std.testing.expect(result.meta(1).author == null);
    try std.testing.expectEqual(@as(usize, 0), result.meta(1).tags.len);

    try std.testing.expectEqual(@as(usize, 2), result.meta(2).tags.len);
}

test "json - object with quotes array of objects" {
    const allocator = std.testing.allocator;
    const content =
        \\{"quotes": [{"quote": "Only", "author": "Me"}]}
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 1), result.quotes.items.len);
    try std.testing.expectEqualStrings("Me", result.meta(0).author.?);
}

test "json - array of strings" {
    const allocator = std.testing.allocator;
    const content =
        \\["First quote", "Second quote", "Third quote"]
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 3), result.quotes.items.len);
    try std.testing.expectEqualStrings("First quote", result.quotes.items[0]);
    try std.testing.expectEqualStrings("Second quote", result.quotes.items[1]);
    try std.testing.expectEqualStrings("Third quote", result.quotes.items[2]);
}

test "json - object with quotes array" {
    const allocator = std.testing.allocator;
    const content =
        \\{"quotes": ["First quote", "Second quote"]}
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 2), result.quotes.items.len);
    try std.testing.expectEqualStrings("First quote", result.quotes.items[0]);
    try std.testing.expectEqualStrings("Second quote", result.quotes.items[1]);
}

test "json - array of objects with quote field" {
    const allocator = std.testing.allocator;
    const content =
        \\[
        \\  {"quote": "First", "author": "Someone"},
        \\  {"quote": "Second", "author": "Other"}
        \\]
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 2), result.quotes.items.len);
    try std.testing.expectEqualStrings("First", result.quotes.items[0]);
    try std.testing.expectEqualStrings("Second", result.quotes.items[1]);
}

test "json - array of objects with text field" {
    const allocator = std.testing.allocator;
    const content =
        \\[
        \\  {"text": "First", "author": "Someone"},
        \\  {"text": "Second", "author": "Other"}
        \\]
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 2), result.quotes.items.len);
    try std.testing.expectEqualStrings("First", result.quotes.items[0]);
    try std.testing.expectEqualStrings("Second", result.quotes.items[1]);
}

test "json - mixed array (strings and objects)" {
    const allocator = std.testing.allocator;
    const content =
        \\["Direct quote", {"quote": "Object quote"}, 123, null]
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 2), result.quotes.items.len);
    try std.testing.expectEqualStrings("Direct quote", result.quotes.items[0]);
    try std.testing.expectEqualStrings("Object quote", result.quotes.items[1]);
}

test "json - malformed JSON" {
    const allocator = std.testing.allocator;
    const content = "[\"quote\", invalid]";

    const result = parse(allocator, content);
    try std.testing.expectError(parser.ParserError.MalformedFormat, result);
}

test "json - empty array" {
    const allocator = std.testing.allocator;
    const content = "[]";

    const result = parse(allocator, content);
    try std.testing.expectError(parser.ParserError.EmptyFile, result);
}

test "json - trim whitespace" {
    const allocator = std.testing.allocator;
    const content =
        \\["  Leading spaces", "Trailing spaces  ", "  Both  "]
    ;

    var result = try parse(allocator, content);
    defer result.deinit(allocator);

    try std.testing.expectEqual(@as(usize, 3), result.quotes.items.len);
    try std.testing.expectEqualStrings("Leading spaces", result.quotes.items[0]);
    try std.testing.expectEqualStrings("Trailing spaces", result.quotes.items[1]);
    try std.testing.expectEqualStrings("Both", result.quotes.items[2]);
}
