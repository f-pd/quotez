const std = @import("std");

/// Common error types for all parsers
pub const ParserError = error{
    MalformedFormat,
    InvalidUtf8,
    EmptyFile,
    UnsupportedStructure,
};

/// Format types supported by quotez
pub const Format = enum {
    json,
    csv,
    toml,
    yaml,
    plaintext,
};

/// A quote text in one language (BCP 47 tag such as "it" or "it-IT")
pub const Translation = struct {
    lang: []const u8,
    text: []const u8,
};

/// Optional per-quote metadata extracted by structured parsers (JSON).
/// All slices are owned by the ParseResult allocator.
pub const QuoteMeta = struct {
    author: ?[]const u8 = null,
    /// Raw tags as found in the source file (not yet normalized)
    tags: []const []const u8 = &.{},
    /// Original language as written in the source (not yet canonicalized)
    lang: ?[]const u8 = null,
    /// Raw translations as found in the source
    translations: []const Translation = &.{},
    /// Source work (book, speech...) with a reference, as written in the source
    work: ?[]const u8 = null,
    /// Source work described per language: JSON "work" as an object
    /// {"en": "...", "it": "..."}
    works: []const Translation = &.{},

    pub fn deinit(self: QuoteMeta, allocator: std.mem.Allocator) void {
        if (self.author) |a| allocator.free(a);
        for (self.tags) |t| allocator.free(t);
        if (self.tags.len > 0) allocator.free(self.tags);
        if (self.lang) |l| allocator.free(l);
        for (self.translations) |t| {
            allocator.free(t.lang);
            allocator.free(t.text);
        }
        if (self.translations.len > 0) allocator.free(self.translations);
        if (self.work) |w| allocator.free(w);
        for (self.works) |t| {
            allocator.free(t.lang);
            allocator.free(t.text);
        }
        if (self.works.len > 0) allocator.free(self.works);
    }
};

/// Result of parsing a file
pub const ParseResult = struct {
    quotes: std.ArrayList([]const u8),
    format: Format,
    /// Metadata parallel to `quotes`. Either empty (format without metadata)
    /// or exactly as long as `quotes`.
    metas: std.ArrayList(QuoteMeta) = .empty,

    pub fn deinit(self: *ParseResult, allocator: std.mem.Allocator) void {
        for (self.quotes.items) |quote| {
            allocator.free(quote);
        }
        self.quotes.deinit(allocator);
        for (self.metas.items) |m| m.deinit(allocator);
        self.metas.deinit(allocator);
    }

    /// Metadata for quote `i`, if the parser provided any
    pub fn meta(self: *const ParseResult, i: usize) QuoteMeta {
        if (self.metas.items.len != self.quotes.items.len) return .{};
        return self.metas.items[i];
    }
};

/// Parser interface - each format parser implements this
pub const Parser = struct {
    parseFn: *const fn (allocator: std.mem.Allocator, content: []const u8) anyerror!ParseResult,

    pub fn parse(self: Parser, allocator: std.mem.Allocator, content: []const u8) !ParseResult {
        return self.parseFn(allocator, content);
    }
};

/// Detect file format based on extension and content
pub fn detectFormat(file_path: []const u8, content: []const u8) Format {
    // Check extension first
    if (std.mem.endsWith(u8, file_path, ".json")) {
        if (looksLikeJson(content)) return .json;
    } else if (std.mem.endsWith(u8, file_path, ".csv")) {
        if (looksLikeCsv(content)) return .csv;
    } else if (std.mem.endsWith(u8, file_path, ".toml")) {
        if (looksLikeToml(content)) return .toml;
    } else if (std.mem.endsWith(u8, file_path, ".yaml") or std.mem.endsWith(u8, file_path, ".yml")) {
        if (looksLikeYaml(content)) return .yaml;
    } else if (std.mem.endsWith(u8, file_path, ".txt")) {
        // One quote per line: a comma or a "key: value" inside a quote must not
        // turn the file into CSV/YAML. Only an obvious JSON document is sniffed.
        return if (looksLikeJson(content)) .json else .plaintext;
    }

    // Try format detection by content in order: JSON → CSV → TOML → YAML → plaintext
    if (looksLikeJson(content)) return .json;
    if (looksLikeCsv(content)) return .csv;
    if (looksLikeToml(content)) return .toml;
    if (looksLikeYaml(content)) return .yaml;

    // Fallback to plaintext
    return .plaintext;
}

/// Check if content looks like JSON
fn looksLikeJson(content: []const u8) bool {
    const trimmed = std.mem.trim(u8, content, &std.ascii.whitespace);
    if (trimmed.len == 0) return false;
    if (trimmed[0] == '{') return true;
    if (trimmed[0] != '[') return false;
    // "[section]" is a TOML table, not a JSON array: look at the first value
    const rest = std.mem.trimStart(u8, trimmed[1..], &std.ascii.whitespace);
    if (rest.len == 0) return false;
    return switch (rest[0]) {
        '"', '[', '{', ']', '-', '0'...'9', 't', 'f', 'n' => !looksLikeTomlTable(trimmed),
        else => false,
    };
}

/// "[name]" or "[[name]]" on the first line with a bare identifier inside
fn looksLikeTomlTable(trimmed: []const u8) bool {
    const line_end = std.mem.indexOfScalar(u8, trimmed, '\n') orelse trimmed.len;
    const line = std.mem.trim(u8, trimmed[0..line_end], " \t\r");
    if (line.len < 3 or line[line.len - 1] != ']') return false;
    const inner = std.mem.trim(u8, line, "[]");
    if (inner.len == 0) return false;
    for (inner) |c| {
        if (!(std.ascii.isAlphanumeric(c) or c == '_' or c == '-' or c == '.')) return false;
    }
    return !std.ascii.isDigit(inner[0]) and !std.mem.eql(u8, inner, "true") and
        !std.mem.eql(u8, inner, "false") and !std.mem.eql(u8, inner, "null");
}

/// Check if content looks like CSV
fn looksLikeCsv(content: []const u8) bool {
    // Look for comma or tab in first line
    var it = std.mem.splitScalar(u8, content, '\n');
    if (it.next()) |first_line| {
        const has_comma = std.mem.indexOf(u8, first_line, ",") != null;
        const has_tab = std.mem.indexOf(u8, first_line, "\t") != null;
        return has_comma or has_tab;
    }
    return false;
}

/// Check if content looks like TOML
fn looksLikeToml(content: []const u8) bool {
    // Look for [section] or key = value patterns
    var it = std.mem.splitScalar(u8, content, '\n');
    while (it.next()) |line| {
        const trimmed = std.mem.trim(u8, line, &std.ascii.whitespace);
        if (trimmed.len == 0) continue;
        if (trimmed[0] == '#') continue; // Comment

        // Check for [section]
        if (trimmed[0] == '[') return true;

        // Check for key = value
        if (std.mem.indexOf(u8, trimmed, " = ") != null or
            std.mem.indexOf(u8, trimmed, "=") != null)
        {
            return true;
        }
    }
    return false;
}

/// Check if content looks like YAML
fn looksLikeYaml(content: []const u8) bool {
    const trimmed = std.mem.trim(u8, content, &std.ascii.whitespace);
    if (trimmed.len == 0) return false;

    // Check for --- document separator
    if (std.mem.startsWith(u8, trimmed, "---")) return true;

    // Check for key: value or - item patterns
    var it = std.mem.splitScalar(u8, trimmed, '\n');
    while (it.next()) |line| {
        const line_trim = std.mem.trim(u8, line, &std.ascii.whitespace);
        if (line_trim.len == 0) continue;
        if (line_trim[0] == '#') continue; // Comment

        // Check for - list item
        if (line_trim[0] == '-' and line_trim.len > 1 and line_trim[1] == ' ') return true;

        // Check for key: value
        if (std.mem.indexOf(u8, line_trim, ": ") != null or
            std.mem.indexOf(u8, line_trim, ":") != null)
        {
            return true;
        }
    }
    return false;
}

/// Normalize UTF-8 and trim whitespace from a quote
pub fn normalizeQuote(allocator: std.mem.Allocator, input: []const u8) !?[]const u8 {
    // Trim whitespace
    const trimmed = std.mem.trim(u8, input, &std.ascii.whitespace);
    if (trimmed.len == 0) return null;

    // Validate UTF-8 and replace invalid sequences
    var result: std.ArrayList(u8) = .empty;
    defer result.deinit(allocator);

    var i: usize = 0;
    while (i < trimmed.len) {
        const len = std.unicode.utf8ByteSequenceLength(trimmed[i]) catch {
            // Invalid UTF-8, insert replacement character
            try result.appendSlice(allocator, "�");
            i += 1;
            continue;
        };

        if (i + len > trimmed.len) {
            // Incomplete sequence at end
            try result.appendSlice(allocator, "�");
            break;
        }

        // Validate the full sequence
        _ = std.unicode.utf8Decode(trimmed[i .. i + len]) catch {
            // Invalid sequence
            try result.appendSlice(allocator, "�");
            i += len;
            continue;
        };

        // Valid UTF-8, copy it
        try result.appendSlice(allocator, trimmed[i .. i + len]);
        i += len;
    }

    // Collapse multiple whitespace to single space
    return try collapseWhitespace(allocator, result.items);
}

/// Collapse multiple whitespace characters into single spaces
fn collapseWhitespace(allocator: std.mem.Allocator, input: []const u8) ![]const u8 {
    var result: std.ArrayList(u8) = .empty;
    errdefer result.deinit(allocator);

    var prev_was_space = false;
    for (input) |c| {
        if (std.ascii.isWhitespace(c)) {
            if (!prev_was_space) {
                try result.append(allocator, ' ');
                prev_was_space = true;
            }
        } else {
            try result.append(allocator, c);
            prev_was_space = false;
        }
    }

    return result.toOwnedSlice(allocator);
}

// Tests
test "detectFormat - JSON" {
    try std.testing.expectEqual(Format.json, detectFormat("test.json", "[\"quote\"]"));
    try std.testing.expectEqual(Format.json, detectFormat("test.txt", "{\"quotes\": []}"));
}

test "detectFormat - CSV" {
    try std.testing.expectEqual(Format.csv, detectFormat("test.csv", "quote,author\nHello,World"));
    try std.testing.expectEqual(Format.csv, detectFormat("test", "one,two,three"));
}

test "detectFormat - TOML" {
    try std.testing.expectEqual(Format.toml, detectFormat("test.toml", "quotes = []"));
    try std.testing.expectEqual(Format.toml, detectFormat("test", "[section]"));
}

test "detectFormat - YAML" {
    try std.testing.expectEqual(Format.yaml, detectFormat("test.yaml", "---\n- quote"));
    try std.testing.expectEqual(Format.yaml, detectFormat("test", "key: value"));
}

test "detectFormat - plaintext fallback" {
    try std.testing.expectEqual(Format.plaintext, detectFormat("test.txt", "Just plain text"));
    // .txt quotes with commas or colons stay plaintext
    try std.testing.expectEqual(Format.plaintext, detectFormat("q.txt", "Short life, long waste. - Seneca"));
    try std.testing.expectEqual(Format.plaintext, detectFormat("q.txt", "Rule one: be kind."));
}

test "normalizeQuote - basic trim" {
    const allocator = std.testing.allocator;
    const result = try normalizeQuote(allocator, "  hello  ");
    defer if (result) |r| allocator.free(r);
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("hello", result.?);
}

test "normalizeQuote - collapse whitespace" {
    const allocator = std.testing.allocator;
    const result = try normalizeQuote(allocator, "hello    world");
    defer if (result) |r| allocator.free(r);
    try std.testing.expect(result != null);
    try std.testing.expectEqualStrings("hello world", result.?);
}

test "normalizeQuote - empty after trim" {
    const allocator = std.testing.allocator;
    const result = try normalizeQuote(allocator, "   ");
    try std.testing.expect(result == null);
}
