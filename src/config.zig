const std = @import("std");
const app_io = @import("compat/io.zig");
const logger = @import("logger.zig");

/// Selection mode for quote serving
pub const SelectionMode = enum {
    random,
    sequential,
    random_no_repeat,
    shuffle_cycle,

    pub fn fromString(s: []const u8) ?SelectionMode {
        if (std.mem.eql(u8, s, "random")) return .random;
        if (std.mem.eql(u8, s, "sequential")) return .sequential;
        if (std.mem.eql(u8, s, "random-no-repeat")) return .random_no_repeat;
        if (std.mem.eql(u8, s, "shuffle-cycle")) return .shuffle_cycle;
        return null;
    }

    pub fn asString(self: SelectionMode) []const u8 {
        return switch (self) {
            .random => "random",
            .sequential => "sequential",
            .random_no_repeat => "random-no-repeat",
            .shuffle_cycle => "shuffle-cycle",
        };
    }
};

/// Immutable configuration loaded from quotez.toml
pub const Configuration = struct {
    // Server section
    host: []const u8,
    tcp_port: u16,
    udp_port: u16,

    // Health section
    health_enabled: bool,
    health_port: u16,

    // Quotes section
    directories: [][]const u8,
    selection_mode: SelectionMode,

    // Polling section
    polling_interval: u32,

    // API section
    api_enabled: bool,
    api_username: []const u8,
    api_password: []const u8,
    api_quotes_path: []const u8,

    // Allocator for owned strings
    allocator: std.mem.Allocator,

    /// Default values per contract
    pub const Defaults = struct {
        pub const host: []const u8 = "0.0.0.0";
        pub const tcp_port: u16 = 8017;
        pub const udp_port: u16 = 8017;
        pub const health_enabled: bool = true;
        pub const health_port: u16 = 8080;
        pub const selection_mode: SelectionMode = .random;
        pub const polling_interval: u32 = 60;
        pub const api_enabled: bool = false;
        pub const api_username: []const u8 = "";
        pub const api_password: []const u8 = "";
        pub const api_quotes_path: []const u8 = "/data/quotes/api-managed.json";
    };
    /// Environment variables that override `[api]` credentials from the TOML file.
    /// The `_FILE` variants point to a file holding the value (Docker/Compose secrets);
    /// a single trailing newline in that file is ignored. The plain variable wins over `_FILE`.
    pub const EnvVars = struct {
        pub const api_username = "QOTD_API_USERNAME";
        pub const api_username_file = "QOTD_API_USERNAME_FILE";
        pub const api_password = "QOTD_API_PASSWORD";
        pub const api_password_file = "QOTD_API_PASSWORD_FILE";
    };

    /// Prefix of the placeholder credentials shipped in example configs.
    /// The service refuses to start with the API enabled while these are still in place.
    pub const placeholder_prefix = "CHANGE_ME";

    /// Load and parse configuration from file.
    /// `env` (usually `init.environ_map`) supplies credential overrides; pass null to ignore the environment.
    pub fn load(allocator: std.mem.Allocator, path: []const u8, env: ?*const std.process.Environ.Map) !Configuration {
        var log = logger.Logger.init();

        const content = std.Io.Dir.cwd().readFileAlloc(app_io.value, path, allocator, .limited(1024 * 1024)) catch |err| {
            log.err("config_error", .{ .reason = "failed to read file", .path = path });
            return err;
        };
        defer allocator.free(content);

        // Parse TOML
        var parser = TomlParser.init(allocator, content);
        parser.env = env;
        defer parser.deinit();

        var config = try parser.parse();

        // Log loaded configuration
        log.info("config_loaded", .{
            .file = path,
            .tcp_port = config.tcp_port,
            .udp_port = config.udp_port,
            .host = config.host,
            .health_enabled = config.health_enabled,
            .health_port = config.health_port,
            .directories = config.directories.len,
            .mode = config.selection_mode.asString(),
            .interval = config.polling_interval,
            .api_enabled = config.api_enabled,
        });
        return config;
    }

    /// Free all owned memory
    pub fn deinit(self: *Configuration) void {
        for (self.directories) |dir| {
            self.allocator.free(dir);
        }
        self.allocator.free(self.directories);
        self.allocator.free(self.host);
        self.allocator.free(self.api_username);
        self.allocator.free(self.api_password);
        self.allocator.free(self.api_quotes_path);
    }
};

/// Minimal TOML parser for quotez configuration
/// Supports only the subset needed: sections, strings, integers, arrays
const TomlParser = struct {
    allocator: std.mem.Allocator,
    content: []const u8,
    pos: usize,
    log: logger.Logger,

    // Parsed values
    host: ?[]const u8 = null,
    tcp_port: ?u16 = null,
    udp_port: ?u16 = null,
    health_enabled: ?bool = null,
    health_port: ?u16 = null,
    directories: ?std.ArrayList([]const u8) = null,
    mode: ?[]const u8 = null,
    polling_interval: ?u32 = null,
    api_enabled: ?bool = null,
    api_username: ?[]const u8 = null,
    api_password: ?[]const u8 = null,
    api_quotes_path: ?[]const u8 = null,

    /// Optional environment used to override API credentials (see Configuration.EnvVars)
    env: ?*const std.process.Environ.Map = null,

    pub fn init(allocator: std.mem.Allocator, content: []const u8) TomlParser {
        return .{
            .allocator = allocator,
            .content = content,
            .pos = 0,
            .log = logger.Logger.init(),
        };
    }

    pub fn deinit(self: *TomlParser) void {
        if (self.directories) |*dirs| {
            // Free each directory string before freeing the ArrayList
            for (dirs.items) |dir| {
                self.allocator.free(dir);
            }
            dirs.deinit(self.allocator);
        }
        // Free the mode string - it's only used to convert to enum, not stored in Configuration
        if (self.mode) |mode_str| {
            self.allocator.free(mode_str);
        }
        // Free api strings if they were parsed but not transferred to Configuration
        if (self.api_username) |u| self.allocator.free(u);
        if (self.api_password) |p| self.allocator.free(p);
        if (self.api_quotes_path) |path| self.allocator.free(path);
        // Note: host is transferred to Configuration, so Configuration.deinit() frees it
    }

    pub fn parse(self: *TomlParser) !Configuration {
        var current_section: ?[]const u8 = null;

        while (self.pos < self.content.len) {
            self.skipWhitespaceAndComments();
            if (self.pos >= self.content.len) break;

            // Check for section header [section]
            if (self.content[self.pos] == '[') {
                current_section = try self.parseSection();
                continue;
            }

            // Parse key = value
            try self.parseKeyValue(current_section);
        }

        // Validate required fields
        if (self.directories == null or self.directories.?.items.len == 0) {
            self.log.err("config_error", .{ .reason = "missing required field: quotes.directories" });
            return error.MissingRequiredField;
        }

        // Environment overrides for secrets (env > *_FILE > TOML)
        try self.applyEnvOverride(&self.api_username, Configuration.EnvVars.api_username, Configuration.EnvVars.api_username_file);
        try self.applyEnvOverride(&self.api_password, Configuration.EnvVars.api_password, Configuration.EnvVars.api_password_file);

        // Apply defaults and build configuration
        // Allocate owned strings first so we can errdefer them if validation fails
        const host = self.host orelse try self.allocator.dupe(u8, Configuration.Defaults.host);
        errdefer self.allocator.free(host);
        const api_username = self.api_username orelse try self.allocator.dupe(u8, Configuration.Defaults.api_username);
        errdefer self.allocator.free(api_username);
        const api_password = self.api_password orelse try self.allocator.dupe(u8, Configuration.Defaults.api_password);
        errdefer self.allocator.free(api_password);
        const api_quotes_path = self.api_quotes_path orelse try self.allocator.dupe(u8, Configuration.Defaults.api_quotes_path);
        errdefer self.allocator.free(api_quotes_path);

        const selection_mode = blk: {
            if (self.mode) |mode_str| {
                if (SelectionMode.fromString(mode_str)) |mode| {
                    break :blk mode;
                } else {
                    self.log.err("config_error", .{
                        .reason = "invalid selection mode",
                        .value = mode_str,
                    });
                    return error.InvalidSelectionMode;
                }
            } else {
                self.log.info("default_applied", .{ .field = "quotes.mode", .value = "random" });
                break :blk Configuration.Defaults.selection_mode;
            }
        };

        const config = Configuration{
            .allocator = self.allocator,
            .host = host,
            .tcp_port = self.tcp_port orelse Configuration.Defaults.tcp_port,
            .udp_port = self.udp_port orelse Configuration.Defaults.udp_port,
            .health_enabled = self.health_enabled orelse Configuration.Defaults.health_enabled,
            .health_port = self.health_port orelse Configuration.Defaults.health_port,
            .selection_mode = selection_mode,
            .polling_interval = self.polling_interval orelse blk: {
                self.log.info("default_applied", .{ .field = "polling.interval_seconds", .value = 60 });
                break :blk Configuration.Defaults.polling_interval;
            },
            .directories = if (self.directories) |*dirs| try dirs.toOwnedSlice(self.allocator) else &.{},
            .api_enabled = self.api_enabled orelse Configuration.Defaults.api_enabled,
            .api_username = api_username,
            .api_password = api_password,
            .api_quotes_path = api_quotes_path,
        };

        // Null out transferred ownership so TomlParser.deinit() doesn't double-free
        self.host = null;
        self.api_username = null;
        self.api_password = null;
        self.api_quotes_path = null;
        // Directories were moved out of the ArrayList; free them if validation fails below
        errdefer {
            for (config.directories) |dir| self.allocator.free(dir);
            self.allocator.free(config.directories);
        }

        // Validate ranges
        if (config.tcp_port == 0 or config.udp_port == 0) {
            self.log.err("config_error", .{ .reason = "port must be in range 1-65535" });
            return error.InvalidPort;
        }

        if (config.polling_interval == 0) {
            self.log.err("config_error", .{ .reason = "polling interval must be positive" });
            return error.InvalidInterval;
        }

        // Validate API credentials
        if (config.api_enabled) {
            if (config.api_username.len == 0 or config.api_password.len == 0) {
                self.log.err("config_error", .{ .reason = "api.username and api.password are required when api.enabled is true" });
                return error.MissingApiCredentials;
            }
            if (std.mem.startsWith(u8, config.api_username, Configuration.placeholder_prefix) or
                std.mem.startsWith(u8, config.api_password, Configuration.placeholder_prefix))
            {
                self.log.err("config_error", .{ .reason = "api credentials are still CHANGE_ME placeholders; set QOTD_API_USERNAME and QOTD_API_PASSWORD" });
                return error.PlaceholderApiCredentials;
            }
        }

        // Log defaults that were applied
        if (self.host == null) {
            self.log.info("default_applied", .{ .field = "server.host", .value = "0.0.0.0" });
        }
        if (self.tcp_port == null) {
            self.log.info("default_applied", .{ .field = "server.tcp_port", .value = 8017 });
        }
        if (self.udp_port == null) {
            self.log.info("default_applied", .{ .field = "server.udp_port", .value = 8017 });
        }
        if (self.health_enabled == null) {
            self.log.info("default_applied", .{ .field = "health.enabled", .value = true });
        }
        if (self.health_port == null) {
            self.log.info("default_applied", .{ .field = "health.port", .value = 8080 });
        }

        return config;
    }

    fn skipWhitespaceAndComments(self: *TomlParser) void {
        while (self.pos < self.content.len) {
            const c = self.content[self.pos];
            if (c == ' ' or c == '\t' or c == '\n' or c == '\r') {
                self.pos += 1;
            } else if (c == '#') {
                // Skip comment until end of line
                while (self.pos < self.content.len and self.content[self.pos] != '\n') {
                    self.pos += 1;
                }
            } else {
                break;
            }
        }
    }

    fn parseSection(self: *TomlParser) ![]const u8 {
        self.pos += 1; // Skip '['
        const start = self.pos;
        while (self.pos < self.content.len and self.content[self.pos] != ']') {
            self.pos += 1;
        }
        if (self.pos >= self.content.len) return error.UnterminatedSection;
        const section = std.mem.trim(u8, self.content[start..self.pos], " \t");
        self.pos += 1; // Skip ']'
        return section;
    }

    fn parseKeyValue(self: *TomlParser, section: ?[]const u8) !void {
        // Parse key
        const key_start = self.pos;
        while (self.pos < self.content.len and self.content[self.pos] != '=' and self.content[self.pos] != '\n') {
            self.pos += 1;
        }
        if (self.pos >= self.content.len or self.content[self.pos] == '\n') {
            return; // Empty line or malformed
        }
        const key = std.mem.trim(u8, self.content[key_start..self.pos], " \t");
        self.pos += 1; // Skip '='
        self.skipWhitespaceAndComments();

        // Parse value based on section and key
        if (section) |sec| {
            if (std.mem.eql(u8, sec, "server")) {
                try self.parseServerValue(key);
            } else if (std.mem.eql(u8, sec, "health")) {
                try self.parseHealthValue(key);
            } else if (std.mem.eql(u8, sec, "quotes")) {
                try self.parseQuotesValue(key);
            } else if (std.mem.eql(u8, sec, "polling")) {
                try self.parsePollingValue(key);
            } else if (std.mem.eql(u8, sec, "api")) {
                try self.parseApiValue(key);
            }
        }
    }

    fn parseServerValue(self: *TomlParser, key: []const u8) !void {
        if (std.mem.eql(u8, key, "host")) {
            self.host = try self.parseString();
        } else if (std.mem.eql(u8, key, "tcp_port")) {
            self.tcp_port = try self.parseInteger(u16);
        } else if (std.mem.eql(u8, key, "udp_port")) {
            self.udp_port = try self.parseInteger(u16);
        }
    }

    fn parseQuotesValue(self: *TomlParser, key: []const u8) !void {
        if (std.mem.eql(u8, key, "directories")) {
            self.directories = try self.parseStringArray();
        } else if (std.mem.eql(u8, key, "mode")) {
            self.mode = try self.parseString();
        }
    }

    fn parsePollingValue(self: *TomlParser, key: []const u8) !void {
        if (std.mem.eql(u8, key, "interval_seconds")) {
            self.polling_interval = try self.parseInteger(u32);
        }
    }

    fn parseHealthValue(self: *TomlParser, key: []const u8) !void {
        if (std.mem.eql(u8, key, "enabled")) {
            self.health_enabled = try self.parseBoolean();
        } else if (std.mem.eql(u8, key, "port")) {
            self.health_port = try self.parseInteger(u16);
        }
    }

    /// Replace `slot` with the value of env var `name`, or with the contents of the file
    /// named by `file_name`. Leaves `slot` untouched when neither is set (or both are empty).
    fn applyEnvOverride(self: *TomlParser, slot: *?[]const u8, name: []const u8, file_name: []const u8) !void {
        const env = self.env orelse return;

        const new_value: []const u8 = blk: {
            if (env.get(name)) |value| {
                if (value.len > 0) break :blk try self.allocator.dupe(u8, value);
            }
            if (env.get(file_name)) |path| {
                if (path.len > 0) {
                    const raw = std.Io.Dir.cwd().readFileAlloc(app_io.value, path, self.allocator, .limited(64 * 1024)) catch |err| {
                        self.log.err("config_error", .{ .reason = "failed to read secret file", .env = file_name, .path = path });
                        return err;
                    };
                    defer self.allocator.free(raw);
                    var trimmed: []const u8 = raw;
                    if (std.mem.endsWith(u8, trimmed, "\n")) trimmed = trimmed[0 .. trimmed.len - 1];
                    if (std.mem.endsWith(u8, trimmed, "\r")) trimmed = trimmed[0 .. trimmed.len - 1];
                    break :blk try self.allocator.dupe(u8, trimmed);
                }
            }
            return;
        };

        if (slot.*) |old| self.allocator.free(old);
        slot.* = new_value;
        self.log.info("env_override_applied", .{ .env = name });
    }

    fn parseApiValue(self: *TomlParser, key: []const u8) !void {
        if (std.mem.eql(u8, key, "enabled")) {
            self.api_enabled = try self.parseBoolean();
        } else if (std.mem.eql(u8, key, "username")) {
            self.api_username = try self.parseString();
        } else if (std.mem.eql(u8, key, "password")) {
            self.api_password = try self.parseString();
        } else if (std.mem.eql(u8, key, "quotes_path")) {
            self.api_quotes_path = try self.parseString();
        }
    }

    fn parseString(self: *TomlParser) ![]const u8 {
        if (self.pos >= self.content.len) return error.UnexpectedEof;
        const quote_char = self.content[self.pos];
        if (quote_char != '"' and quote_char != '\'') return error.ExpectedString;
        self.pos += 1;
        const start = self.pos;
        while (self.pos < self.content.len and self.content[self.pos] != quote_char) {
            self.pos += 1;
        }
        if (self.pos >= self.content.len) return error.UnterminatedString;
        const value = self.content[start..self.pos];
        self.pos += 1; // Skip closing quote
        return try self.allocator.dupe(u8, value);
    }

    fn parseInteger(self: *TomlParser, comptime T: type) !T {
        const start = self.pos;
        while (self.pos < self.content.len and std.ascii.isDigit(self.content[self.pos])) {
            self.pos += 1;
        }
        const value_str = self.content[start..self.pos];
        return std.fmt.parseInt(T, value_str, 10) catch return error.InvalidInteger;
    }

    fn parseBoolean(self: *TomlParser) !bool {
        const start = self.pos;
        while (self.pos < self.content.len and (std.ascii.isAlphabetic(self.content[self.pos]) or std.ascii.isDigit(self.content[self.pos]))) {
            self.pos += 1;
        }
        const value_str = self.content[start..self.pos];
        if (std.mem.eql(u8, value_str, "true")) return true;
        if (std.mem.eql(u8, value_str, "false")) return false;
        return error.InvalidBoolean;
    }

    fn parseStringArray(self: *TomlParser) !std.ArrayList([]const u8) {
        if (self.pos >= self.content.len or self.content[self.pos] != '[') {
            return error.ExpectedArray;
        }
        self.pos += 1; // Skip '['

        var array = std.ArrayList([]const u8).initCapacity(self.allocator, 4) catch return error.OutOfMemory;
        errdefer {
            for (array.items) |item| {
                self.allocator.free(item);
            }
            array.deinit(self.allocator);
        }

        while (true) {
            self.skipWhitespaceAndComments();
            if (self.pos >= self.content.len) return error.UnterminatedArray;
            if (self.content[self.pos] == ']') {
                self.pos += 1;
                break;
            }
            if (self.content[self.pos] == ',') {
                self.pos += 1;
                continue;
            }
            const item = try self.parseString();
            try array.append(self.allocator, item);
        }

        return array;
    }
};

// Unit tests
test "selection mode from string" {
    try std.testing.expectEqual(SelectionMode.random, SelectionMode.fromString("random").?);
    try std.testing.expectEqual(SelectionMode.sequential, SelectionMode.fromString("sequential").?);
    try std.testing.expectEqual(SelectionMode.random_no_repeat, SelectionMode.fromString("random-no-repeat").?);
    try std.testing.expectEqual(SelectionMode.shuffle_cycle, SelectionMode.fromString("shuffle-cycle").?);
    try std.testing.expectEqual(@as(?SelectionMode, null), SelectionMode.fromString("invalid"));
}

test "minimal valid configuration" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data/quotes"]
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqual(@as(u16, 8017), config.tcp_port);
    try std.testing.expectEqual(@as(u16, 8017), config.udp_port);
    try std.testing.expectEqualStrings("0.0.0.0", config.host);
    try std.testing.expectEqual(@as(usize, 1), config.directories.len);
    try std.testing.expectEqualStrings("/data/quotes", config.directories[0]);
    try std.testing.expectEqual(SelectionMode.random, config.selection_mode);
    try std.testing.expectEqual(@as(u32, 60), config.polling_interval);
}

test "full configuration with all fields" {
    const allocator = std.testing.allocator;
    const content =
        \\[server]
        \\host = "127.0.0.1"
        \\tcp_port = 8017
        \\udp_port = 8017
        \\
        \\[quotes]
        \\directories = ["/data/quotes", "/etc/quotez/custom"]
        \\mode = "shuffle-cycle"
        \\
        \\[polling]
        \\interval_seconds = 120
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqual(@as(u16, 8017), config.tcp_port);
    try std.testing.expectEqual(@as(u16, 8017), config.udp_port);
    try std.testing.expectEqualStrings("127.0.0.1", config.host);
    try std.testing.expectEqual(@as(usize, 2), config.directories.len);
    try std.testing.expectEqualStrings("/data/quotes", config.directories[0]);
    try std.testing.expectEqualStrings("/etc/quotez/custom", config.directories[1]);
    try std.testing.expectEqual(SelectionMode.shuffle_cycle, config.selection_mode);
    try std.testing.expectEqual(@as(u32, 120), config.polling_interval);
}

test "missing required field" {
    const allocator = std.testing.allocator;
    const content =
        \\[server]
        \\tcp_port = 17
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    const result = parser.parse();
    try std.testing.expectError(error.MissingRequiredField, result);
}

test "invalid selection mode" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data"]
        \\mode = "invalid_mode"
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    const result = parser.parse();
    try std.testing.expectError(error.InvalidSelectionMode, result);
}

test "empty directories array" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = []
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    const result = parser.parse();
    try std.testing.expectError(error.MissingRequiredField, result);
}

test "configuration with comments" {
    const allocator = std.testing.allocator;
    const content =
        \\# This is a comment
        \\[quotes]
        \\directories = ["/data/quotes"] # inline comment
        \\# Another comment
        \\mode = "sequential"
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqual(SelectionMode.sequential, config.selection_mode);
}

test "health section parses correctly" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data/quotes"]
        \\
        \\[health]
        \\enabled = true
        \\port = 9090
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqual(true, config.health_enabled);
    try std.testing.expectEqual(@as(u16, 9090), config.health_port);
}

test "health section defaults apply when missing" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data/quotes"]
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqual(true, config.health_enabled);
    try std.testing.expectEqual(@as(u16, 8080), config.health_port);
}

const api_test_toml =
    \\[quotes]
    \\directories = ["/data/quotes"]
    \\
    \\[api]
    \\enabled = true
    \\username = "toml-user"
    \\password = "toml-pass"
;

test "api credentials from TOML are used when env is absent" {
    const allocator = std.testing.allocator;
    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();

    var parser = TomlParser.init(allocator, api_test_toml);
    parser.env = &env;
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqualStrings("toml-user", config.api_username);
    try std.testing.expectEqualStrings("toml-pass", config.api_password);
}

test "env vars override api credentials from TOML" {
    const allocator = std.testing.allocator;
    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();
    try env.put("QOTD_API_USERNAME", "env-user");
    try env.put("QOTD_API_PASSWORD", "env:pass:with:colons");

    var parser = TomlParser.init(allocator, api_test_toml);
    parser.env = &env;
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqualStrings("env-user", config.api_username);
    try std.testing.expectEqualStrings("env:pass:with:colons", config.api_password);
}

test "env vars supply api credentials missing from TOML" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data/quotes"]
        \\
        \\[api]
        \\enabled = true
    ;
    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();
    try env.put("QOTD_API_USERNAME", "env-user");
    try env.put("QOTD_API_PASSWORD", "env-pass");

    var parser = TomlParser.init(allocator, content);
    parser.env = &env;
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqualStrings("env-user", config.api_username);
    try std.testing.expectEqualStrings("env-pass", config.api_password);
}

test "empty env var does not override TOML value" {
    const allocator = std.testing.allocator;
    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();
    try env.put("QOTD_API_PASSWORD", "");

    var parser = TomlParser.init(allocator, api_test_toml);
    parser.env = &env;
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqualStrings("toml-pass", config.api_password);
}

test "_FILE env vars read credentials from secret files" {
    const allocator = std.testing.allocator;
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();

    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "user", .data = "file-user\n" });
    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "pass", .data = "file-pass\r\n" });

    const user_path = try std.fmt.allocPrint(allocator, ".zig-cache/tmp/{s}/user", .{tmp.sub_path});
    defer allocator.free(user_path);
    const pass_path = try std.fmt.allocPrint(allocator, ".zig-cache/tmp/{s}/pass", .{tmp.sub_path});
    defer allocator.free(pass_path);

    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();
    try env.put("QOTD_API_USERNAME_FILE", user_path);
    try env.put("QOTD_API_PASSWORD_FILE", pass_path);

    var parser = TomlParser.init(allocator, api_test_toml);
    parser.env = &env;
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqualStrings("file-user", config.api_username);
    try std.testing.expectEqualStrings("file-pass", config.api_password);
}

test "missing secret file is a hard error" {
    const allocator = std.testing.allocator;
    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();
    try env.put("QOTD_API_PASSWORD_FILE", "/nonexistent/quotez-secret");

    var parser = TomlParser.init(allocator, api_test_toml);
    parser.env = &env;
    defer parser.deinit();

    try std.testing.expectError(error.FileNotFound, parser.parse());
}

test "placeholder api credentials are rejected when api is enabled" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data/quotes"]
        \\
        \\[api]
        \\enabled = true
        \\username = "CHANGE_ME_ADMIN_USERNAME"
        \\password = "CHANGE_ME_LONG_RANDOM_SECRET"
    ;

    var parser = TomlParser.init(allocator, content);
    defer parser.deinit();

    try std.testing.expectError(error.PlaceholderApiCredentials, parser.parse());
}

test "env vars replace placeholder api credentials" {
    const allocator = std.testing.allocator;
    const content =
        \\[quotes]
        \\directories = ["/data/quotes"]
        \\
        \\[api]
        \\enabled = true
        \\username = "CHANGE_ME_ADMIN_USERNAME"
        \\password = "CHANGE_ME_LONG_RANDOM_SECRET"
    ;
    var env = std.process.Environ.Map.init(allocator);
    defer env.deinit();
    try env.put("QOTD_API_USERNAME", "real-user");
    try env.put("QOTD_API_PASSWORD", "real-pass");

    var parser = TomlParser.init(allocator, content);
    parser.env = &env;
    defer parser.deinit();

    var config = try parser.parse();
    defer config.deinit();

    try std.testing.expectEqualStrings("real-user", config.api_username);
    try std.testing.expectEqualStrings("real-pass", config.api_password);
}
