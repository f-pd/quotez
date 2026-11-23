const std = @import("std");
const app_io = @import("compat/io.zig");
const logger = @import("logger.zig");
const config = @import("config.zig");
const parser_mod = @import("parsers/parser.zig");
const txt_parser = @import("parsers/txt.zig");
const json_parser = @import("parsers/json.zig");
const csv_parser = @import("parsers/csv.zig");
const toml_parser = @import("parsers/toml.zig");
const yaml_parser = @import("parsers/yaml.zig");

/// Quote entity - immutable quote with content-based hash
pub const Quote = struct {
    content: []const u8,
    hash: [32]u8,
    source_path: ?[]const u8,
    /// Author, when the source format provides one (e.g. JSON "author")
    author: ?[]const u8 = null,
    /// Normalized tags (lowercase, deduplicated), see `normalizeTag`
    tags: []const []const u8 = &.{},

    /// Create a new quote from content
    pub fn init(allocator: std.mem.Allocator, content: []const u8, source_path: ?[]const u8) !Quote {
        return initWithMeta(allocator, content, source_path, null, &.{});
    }

    /// Create a new quote with author and raw tags (normalized and deduplicated here).
    /// The hash only covers the content, so metadata never affects deduplication.
    pub fn initWithMeta(
        allocator: std.mem.Allocator,
        content: []const u8,
        source_path: ?[]const u8,
        author: ?[]const u8,
        raw_tags: []const []const u8,
    ) !Quote {
        // Normalize content: trim whitespace
        const normalized = std.mem.trim(u8, content, " \t\n\r");

        // Validate: must not be empty
        if (normalized.len == 0) {
            return error.EmptyQuote;
        }

        // Compute Blake3 hash for deduplication
        const Blake3 = std.crypto.hash.Blake3;
        var hash: [32]u8 = undefined;
        Blake3.hash(normalized, &hash, .{});

        // Store normalized content
        const owned_content = try allocator.dupe(u8, normalized);
        errdefer allocator.free(owned_content);

        const owned_path = if (source_path) |path|
            try allocator.dupe(u8, path)
        else
            null;
        errdefer if (owned_path) |path| allocator.free(path);

        const owned_author = if (author) |a| blk: {
            const trimmed = std.mem.trim(u8, a, " \t\n\r");
            break :blk if (trimmed.len == 0) null else try allocator.dupe(u8, trimmed);
        } else null;
        errdefer if (owned_author) |a| allocator.free(a);

        const owned_tags = try normalizeTags(allocator, raw_tags);

        return Quote{
            .content = owned_content,
            .hash = hash,
            .source_path = owned_path,
            .author = owned_author,
            .tags = owned_tags,
        };
    }

    /// Free quote memory
    pub fn deinit(self: Quote, allocator: std.mem.Allocator) void {
        allocator.free(self.content);
        if (self.source_path) |path| {
            allocator.free(path);
        }
        if (self.author) |a| allocator.free(a);
        freeTags(allocator, self.tags);
    }

    /// Merge author/tags of a duplicate into this quote (author: first one wins)
    pub fn mergeMeta(self: *Quote, allocator: std.mem.Allocator, other: Quote) !void {
        if (self.author == null) {
            if (other.author) |a| self.author = try allocator.dupe(u8, a);
        }
        var missing: usize = 0;
        for (other.tags) |t| {
            if (!self.hasTag(t)) missing += 1;
        }
        if (missing == 0) return;

        const merged = try allocator.alloc([]const u8, self.tags.len + missing);
        var n: usize = 0;
        errdefer {
            for (merged[self.tags.len..n]) |t| allocator.free(t);
            allocator.free(merged);
        }
        @memcpy(merged[0..self.tags.len], self.tags);
        n = self.tags.len;
        for (other.tags) |t| {
            if (self.hasTag(t)) continue;
            merged[n] = try allocator.dupe(u8, t);
            n += 1;
        }
        if (self.tags.len > 0) allocator.free(self.tags);
        self.tags = merged;
    }

    /// True if the quote carries `tag` (already normalized)
    pub fn hasTag(self: Quote, tag: []const u8) bool {
        for (self.tags) |t| {
            if (std.mem.eql(u8, t, tag)) return true;
        }
        return false;
    }
};

/// Normalize a tag: trim, ASCII-lowercase, inner whitespace/underscores become '-'.
/// Writes into `out` and returns the used slice (empty if nothing remains).
pub fn normalizeTag(raw: []const u8, out: []u8) []const u8 {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    var len: usize = 0;
    var prev_dash = false;
    for (trimmed) |c| {
        if (len >= out.len) break;
        const mapped: u8 = if (std.ascii.isWhitespace(c) or c == '_') '-' else std.ascii.toLower(c);
        if (mapped == '-') {
            if (prev_dash or len == 0) continue;
            prev_dash = true;
        } else {
            prev_dash = false;
        }
        out[len] = mapped;
        len += 1;
    }
    while (len > 0 and out[len - 1] == '-') len -= 1;
    return out[0..len];
}

/// Maximum length of a single normalized tag
pub const max_tag_len = 64;

fn normalizeTags(allocator: std.mem.Allocator, raw_tags: []const []const u8) ![]const []const u8 {
    if (raw_tags.len == 0) return &.{};
    var list: std.ArrayList([]const u8) = .empty;
    errdefer {
        for (list.items) |t| allocator.free(t);
        list.deinit(allocator);
    }
    outer: for (raw_tags) |raw| {
        var buf: [max_tag_len]u8 = undefined;
        const tag = normalizeTag(raw, &buf);
        if (tag.len == 0) continue;
        for (list.items) |existing| {
            if (std.mem.eql(u8, existing, tag)) continue :outer;
        }
        try list.append(allocator, try allocator.dupe(u8, tag));
    }
    if (list.items.len == 0) {
        list.deinit(allocator);
        return &.{};
    }
    return list.toOwnedSlice(allocator);
}

fn freeTags(allocator: std.mem.Allocator, tags: []const []const u8) void {
    if (tags.len == 0) return;
    for (tags) |t| allocator.free(t);
    allocator.free(tags);
}

/// Metadata about the quote store
pub const StoreMetadata = struct {
    total_files_parsed: usize = 0,
    total_quotes_loaded: usize = 0,
    duplicates_removed: usize = 0,
    unique_quotes: usize = 0,
};

/// In-memory collection of quotes with deduplication
pub const QuoteStore = struct {
    quotes: std.ArrayList(Quote),
    allocator: std.mem.Allocator,
    last_rebuild: i64,
    metadata: StoreMetadata,
    log: logger.Logger,

    /// Initialize an empty quote store
    pub fn init(allocator: std.mem.Allocator) QuoteStore {
        return .{
            .quotes = .empty,
            .allocator = allocator,
            .last_rebuild = 0, // Use 0 instead of timestamp for now
            .metadata = .{},
            .log = logger.Logger.init(),
        };
    }

    /// Free all quotes and metadata
    pub fn deinit(self: *QuoteStore) void {
        for (self.quotes.items) |quote| {
            quote.deinit(self.allocator);
        }
        self.quotes.deinit(self.allocator);
    }

    /// Build quote store from directories
    pub fn build(self: *QuoteStore, directories: []const []const u8) !void {
        // Clear existing quotes
        for (self.quotes.items) |quote| {
            quote.deinit(self.allocator);
        }
        self.quotes.clearRetainingCapacity();

        // Reset metadata
        self.metadata = .{};

        // Hash map for deduplication: content hash -> index in self.quotes
        var seen = std.AutoHashMap([32]u8, usize).init(self.allocator);
        defer seen.deinit();

        // Walk all directories
        for (directories) |dir| {
            self.walkDirectory(dir, &seen) catch |err| {
                self.log.warn("directory_scan_failed", .{ .directory = dir, .err = @errorName(err) });
                continue;
            };
        }

        // Update metadata
        self.metadata.unique_quotes = self.quotes.items.len;
        self.last_rebuild = @intCast(@divTrunc(app_io.nowNs(), std.time.ns_per_s));

        // Log results
        if (self.metadata.unique_quotes == 0) {
            self.log.warn("empty_quote_store", .{
                .directories = directories.len,
                .files_parsed = self.metadata.total_files_parsed,
            });
        } else {
            self.log.info("quote_store_built", .{
                .files = self.metadata.total_files_parsed,
                .quotes = self.metadata.total_quotes_loaded,
                .duplicates_removed = self.metadata.duplicates_removed,
                .unique = self.metadata.unique_quotes,
            });
        }
    }

    /// Walk a directory recursively and load quote files
    fn walkDirectory(self: *QuoteStore, dir_path: []const u8, seen: *std.AutoHashMap([32]u8, usize)) !void {
        var dir = std.Io.Dir.cwd().openDir(app_io.value, dir_path, .{ .iterate = true }) catch |err| {
            self.log.warn("directory_open_failed", .{ .path = dir_path, .err = @errorName(err) });
            return err;
        };
        defer dir.close(app_io.value);

        var walker = try dir.walk(self.allocator);
        defer walker.deinit();

        while (try walker.next(app_io.value)) |entry| {
            if (entry.kind != .file) continue;

            // Build full path
            const full_path = try std.fs.path.join(self.allocator, &[_][]const u8{ dir_path, entry.path });
            defer self.allocator.free(full_path);

            // Try to parse file (sub-directories become tags)
            self.parseQuoteFile(full_path, entry.path, seen) catch |err| {
                self.log.warn("file_parse_failed", .{ .path = full_path, .err = @errorName(err) });
                continue;
            };

            self.metadata.total_files_parsed += 1;
        }
    }

    /// Parse a single quote file with format auto-detection
    fn parseQuoteFile(self: *QuoteStore, path: []const u8, rel_path: []const u8, seen: *std.AutoHashMap([32]u8, usize)) !void {
        const content = try std.Io.Dir.cwd().readFileAlloc(app_io.value, path, self.allocator, .limited(10 * 1024 * 1024)); // 10MB max
        defer self.allocator.free(content);

        // Detect format
        const format = parser_mod.detectFormat(path, content);

        // Select appropriate parser
        const selected_parser = switch (format) {
            .json => json_parser.jsonParser,
            .csv => csv_parser.csvParser,
            .toml => toml_parser.tomlParser,
            .yaml => yaml_parser.yamlParser,
            .plaintext => txt_parser.txtParser,
        };

        // Parse the file
        var parse_result = selected_parser.parse(self.allocator, content) catch |err| {
            self.log.err("file_parse_error", .{ .path = path, .format = @tagName(format), .err = @errorName(err) });
            return err;
        };
        defer parse_result.deinit(self.allocator);

        // Tags derived from the sub-directories of the quote directory,
        // e.g. quotes/philosophy/stoic/seneca.txt -> ["philosophy", "stoic"]
        var dir_tags: std.ArrayList([]const u8) = .empty;
        defer dir_tags.deinit(self.allocator);
        if (std.fs.path.dirname(rel_path)) |rel_dir| {
            var comp_it = std.mem.tokenizeAny(u8, rel_dir, "/\\");
            while (comp_it.next()) |comp| try dir_tags.append(self.allocator, comp);
        }

        var tag_buf: std.ArrayList([]const u8) = .empty;
        defer tag_buf.deinit(self.allocator);

        // Add quotes to store
        for (parse_result.quotes.items, 0..) |quote_content, i| {
            const meta = parse_result.meta(i);
            tag_buf.clearRetainingCapacity();
            try tag_buf.appendSlice(self.allocator, dir_tags.items);
            try tag_buf.appendSlice(self.allocator, meta.tags);

            // Create quote with hash
            const quote = Quote.initWithMeta(self.allocator, quote_content, path, meta.author, tag_buf.items) catch |err| {
                if (err != error.EmptyQuote) {
                    self.log.warn("quote_init_failed", .{ .path = path, .err = @errorName(err) });
                }
                continue;
            };

            self.metadata.total_quotes_loaded += 1;

            // Check for duplicate: keep the first copy but merge its metadata,
            // so tags survive whatever order files are walked in
            if (seen.get(quote.hash)) |existing_index| {
                self.metadata.duplicates_removed += 1;
                defer quote.deinit(self.allocator);
                try self.quotes.items[existing_index].mergeMeta(self.allocator, quote);
                continue;
            }

            // Add to store
            try seen.put(quote.hash, self.quotes.items.len);
            try self.quotes.append(self.allocator, quote);
        }
    }

    /// Check if store is empty
    pub fn isEmpty(self: *const QuoteStore) bool {
        return self.quotes.items.len == 0;
    }

    /// Get a quote by index (for selector usage)
    pub fn get(self: *const QuoteStore, index: usize) ?[]const u8 {
        if (index >= self.quotes.items.len) return null;
        return self.quotes.items[index].content;
    }

    /// Get the full quote (content + metadata) by index
    pub fn getQuote(self: *const QuoteStore, index: usize) ?*const Quote {
        if (index >= self.quotes.items.len) return null;
        return &self.quotes.items[index];
    }

    /// Get total number of quotes
    pub fn count(self: *const QuoteStore) usize {
        return self.quotes.items.len;
    }

    /// Add a quote to the store with deduplication
    /// Creates a new quote from raw content and checks for duplicates
    /// using Blake3 hash comparison
    pub fn add(self: *QuoteStore, content: []const u8) !void {
        // Create quote with hash
        const quote = try Quote.init(self.allocator, content, null);

        // Check for duplicates using Blake3 hash
        var is_duplicate = false;
        for (self.quotes.items) |existing| {
            if (std.mem.eql(u8, &existing.hash, &quote.hash)) {
                is_duplicate = true;
                break;
            }
        }

        if (is_duplicate) {
            quote.deinit(self.allocator);
            self.metadata.duplicates_removed += 1;
        } else {
            try self.quotes.append(self.allocator, quote);
            self.metadata.unique_quotes += 1;
        }
        self.metadata.total_quotes_loaded += 1;
    }

    /// Alias for add() - provides alternative method name
    pub fn addQuote(self: *QuoteStore, content: []const u8) !void {
        return self.add(content);
    }

    /// Remove a quote by index. Returns error.IndexOutOfBounds if index >= count.
    pub fn removeQuote(self: *QuoteStore, index: usize) !void {
        if (index >= self.quotes.items.len) return error.IndexOutOfBounds;
        const quote = self.quotes.orderedRemove(index);
        quote.deinit(self.allocator);
        if (self.metadata.unique_quotes > 0) self.metadata.unique_quotes -= 1;
    }
};

// Unit tests
test "normalizeTag" {
    var buf: [max_tag_len]u8 = undefined;
    try std.testing.expectEqualStrings("science-fiction", normalizeTag("  Science  Fiction ", &buf));
    try std.testing.expectEqualStrings("stoic", normalizeTag("STOIC", &buf));
    try std.testing.expectEqualStrings("a-b", normalizeTag("_a__b_", &buf));
    try std.testing.expectEqualStrings("", normalizeTag("   ", &buf));
}

test "quote initWithMeta normalizes and dedups tags" {
    const allocator = std.testing.allocator;
    const raw = [_][]const u8{ "Philosophy", "philosophy", " ", "Ancient Greece" };
    const q = try Quote.initWithMeta(allocator, "Know thyself", null, " Socrates ", &raw);
    defer q.deinit(allocator);

    try std.testing.expectEqualStrings("Socrates", q.author.?);
    try std.testing.expectEqual(@as(usize, 2), q.tags.len);
    try std.testing.expect(q.hasTag("philosophy"));
    try std.testing.expect(q.hasTag("ancient-greece"));
    try std.testing.expect(!q.hasTag("Philosophy"));

    // Metadata never changes the dedup hash
    const plain = try Quote.init(allocator, "Know thyself", null);
    defer plain.deinit(allocator);
    try std.testing.expectEqualSlices(u8, &plain.hash, &q.hash);
}

test "quote normalization and hashing" {
    const allocator = std.testing.allocator;

    const q1 = try Quote.init(allocator, "  Hello World  \n", null);
    defer q1.deinit(allocator);

    const q2 = try Quote.init(allocator, "Hello World", null);
    defer q2.deinit(allocator);

    // Content should be normalized
    try std.testing.expectEqualStrings("Hello World", q1.content);
    try std.testing.expectEqualStrings("Hello World", q2.content);

    // Hashes should match
    try std.testing.expectEqualSlices(u8, &q1.hash, &q2.hash);
}

test "empty quote rejected" {
    const allocator = std.testing.allocator;
    const result = Quote.init(allocator, "   \n\t  ", null);
    try std.testing.expectError(error.EmptyQuote, result);
}

test "quote store deduplication" {
    const allocator = std.testing.allocator;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    var seen = std.AutoHashMap([32]u8, void).init(allocator);
    defer seen.deinit();

    // Add quote 1
    const q1 = try Quote.init(allocator, "Quote A", null);
    try seen.put(q1.hash, {});
    try store.quotes.append(allocator, q1);
    store.metadata.total_quotes_loaded += 1;

    // Try to add duplicate
    const q2 = try Quote.init(allocator, "Quote A", null);
    if (seen.contains(q2.hash)) {
        store.metadata.duplicates_removed += 1;
        q2.deinit(allocator);
    } else {
        try seen.put(q2.hash, {});
        try store.quotes.append(allocator, q2);
        store.metadata.total_quotes_loaded += 1;
    }

    // Add different quote
    const q3 = try Quote.init(allocator, "Quote B", null);
    if (!seen.contains(q3.hash)) {
        try seen.put(q3.hash, {});
        try store.quotes.append(allocator, q3);
        store.metadata.total_quotes_loaded += 1;
    }

    try std.testing.expectEqual(@as(usize, 2), store.quotes.items.len);
    try std.testing.expectEqual(@as(usize, 2), store.metadata.total_quotes_loaded);
    try std.testing.expectEqual(@as(usize, 1), store.metadata.duplicates_removed);
}

test "quote store get and count" {
    const allocator = std.testing.allocator;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    var seen = std.AutoHashMap([32]u8, void).init(allocator);
    defer seen.deinit();

    const q1 = try Quote.init(allocator, "First", null);
    try seen.put(q1.hash, {});
    try store.quotes.append(allocator, q1);

    const q2 = try Quote.init(allocator, "Second", null);
    try seen.put(q2.hash, {});
    try store.quotes.append(allocator, q2);

    try std.testing.expectEqual(@as(usize, 2), store.count());
    try std.testing.expectEqualStrings("First", store.get(0).?);
    try std.testing.expectEqualStrings("Second", store.get(1).?);
    try std.testing.expectEqual(@as(?[]const u8, null), store.get(2));
}

test "quote store isEmpty" {
    const allocator = std.testing.allocator;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    try std.testing.expect(store.isEmpty());

    var seen = std.AutoHashMap([32]u8, void).init(allocator);
    defer seen.deinit();

    const q = try Quote.init(allocator, "Test", null);
    try seen.put(q.hash, {});
    try store.quotes.append(allocator, q);

    try std.testing.expect(!store.isEmpty());
}

test "quote store removeQuote removes index and shifts" {
    const allocator = std.testing.allocator;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    try store.add("First");
    try store.add("Second");
    try store.add("Third");

    try std.testing.expectEqual(@as(usize, 3), store.count());
    try std.testing.expectEqual(@as(usize, 3), store.metadata.unique_quotes);

    try store.removeQuote(1);

    try std.testing.expectEqual(@as(usize, 2), store.count());
    try std.testing.expectEqualStrings("First", store.get(0).?);
    try std.testing.expectEqualStrings("Third", store.get(1).?);
    try std.testing.expectEqual(@as(usize, 2), store.metadata.unique_quotes);
}

test "quote store removeQuote out of bounds" {
    const allocator = std.testing.allocator;

    var store = QuoteStore.init(allocator);
    defer store.deinit();

    try store.add("Only");
    try std.testing.expectError(error.IndexOutOfBounds, store.removeQuote(1));
    try std.testing.expectEqual(@as(usize, 1), store.count());
}

test "quote store tags quotes from sub-directories and JSON metadata" {
    const allocator = std.testing.allocator;
    const io = std.testing.io;

    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();

    try tmp.dir.createDirPath(io, "Philosophy/stoic");
    try tmp.dir.writeFile(io, .{ .sub_path = "Philosophy/stoic/seneca.txt", .data = "Luck is what happens when preparation meets opportunity.\n" });
    try tmp.dir.writeFile(io, .{ .sub_path = "root.txt", .data = "Untagged quote\n" });
    // Same quote in another folder: its tag is merged, not lost
    try tmp.dir.createDirPath(io, "luck");
    try tmp.dir.writeFile(io, .{ .sub_path = "luck/dup.txt", .data = "Luck is what happens when preparation meets opportunity.\n" });
    try tmp.dir.writeFile(io, .{
        .sub_path = "meta.json",
        .data =
        \\[{"quote": "Be the change.", "author": "Gandhi", "tags": ["Change", "life"]}]
        ,
    });

    var path_buf: [4096]u8 = undefined;
    const tmp_path_len = try tmp.dir.realPath(io, &path_buf);
    const dirs = [_][]const u8{path_buf[0..tmp_path_len]};

    var store = QuoteStore.init(allocator);
    defer store.deinit();
    try store.build(&dirs);

    try std.testing.expectEqual(@as(usize, 3), store.count());

    var found = [_]bool{ false, false, false };
    for (store.quotes.items) |q| {
        if (std.mem.startsWith(u8, q.content, "Luck")) {
            found[0] = true;
            try std.testing.expect(q.hasTag("philosophy"));
            try std.testing.expect(q.hasTag("stoic"));
            try std.testing.expect(q.hasTag("luck"));
        } else if (std.mem.startsWith(u8, q.content, "Untagged")) {
            found[1] = true;
            try std.testing.expectEqual(@as(usize, 0), q.tags.len);
        } else if (std.mem.startsWith(u8, q.content, "Be the change")) {
            found[2] = true;
            try std.testing.expectEqualStrings("Gandhi", q.author.?);
            try std.testing.expect(q.hasTag("change"));
            try std.testing.expect(q.hasTag("life"));
        }
    }
    try std.testing.expect(found[0] and found[1] and found[2]);
}
