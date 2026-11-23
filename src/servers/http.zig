const std = @import("std");
const logger = @import("../logger.zig");
const quote_store = @import("../quote_store.zig");
const posix_net = @import("../compat/posix_net.zig");
const net = @import("../net.zig");
const selector_mod = @import("../selector.zig");
const watcher_mod = @import("../watcher.zig");
const config_mod = @import("../config.zig");
const app_io = @import("../compat/io.zig");
const runtime = @import("../runtime.zig");
const public_routes = @import("public_routes.zig");

/// HTTP health endpoint server
pub const HttpServer = struct {
    socket: std.posix.socket_t,
    address: std.posix.sockaddr.in,
    store: *quote_store.QuoteStore,
    log: logger.Logger,
    allocator: std.mem.Allocator,
    auth_username: []const u8,
    auth_password: []const u8,
    selector: *selector_mod.Selector,
    watcher: *watcher_mod.FileWatcher,
    startup_time: i128,
    api_quotes_path: []const u8,
    config_ref: *const config_mod.Configuration,
    /// RNG for the public /quote and /n routes (independent of the QOTD selector)
    rng: std.Random.DefaultPrng,

    /// Initialize and bind HTTP server
    pub fn init(
        allocator: std.mem.Allocator,
        host: []const u8,
        port: u16,
        store: *quote_store.QuoteStore,
        auth_username: []const u8,
        auth_password: []const u8,
        sel: *selector_mod.Selector,
        file_watcher: *watcher_mod.FileWatcher,
        startup: i128,
        api_quotes_path: []const u8,
        config: *const config_mod.Configuration,
    ) !HttpServer {
        var log = logger.Logger.init();

        // Parse host string into IPv4 bytes
        const parsed_bytes = net.parseIpv4(host) catch |err| {
            log.err("http_bind_failed", .{
                .reason = "invalid address",
                .host = host,
                .port = port,
                .err = @errorName(err),
            });
            return err;
        };

        const addr = std.posix.sockaddr.in{
            .family = std.posix.AF.INET,
            .port = std.mem.nativeToBig(u16, port),
            .addr = parsed_bytes,
        };

        // Create socket
        const socket = try posix_net.socket(
            std.posix.AF.INET,
            std.posix.SOCK.STREAM,
            std.posix.IPPROTO.TCP,
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
        try posix_net.bind(socket, @ptrCast(&addr), @sizeOf(std.posix.sockaddr.in));

        // Listen
        try posix_net.listen(socket, 128);

        // Set non-blocking mode for event loop
        const flags = try posix_net.fcntl(socket, std.posix.F.GETFL, 0);
        const nonblock_flag = @as(usize, @as(u32, @bitCast(std.posix.O{ .NONBLOCK = true })));
        _ = try posix_net.fcntl(socket, std.posix.F.SETFL, flags | nonblock_flag);

        log.info("http_server_started", .{
            .host = host,
            .port = port,
        });

        return HttpServer{
            .socket = socket,
            .address = addr,
            .store = store,
            .log = log,
            .allocator = allocator,
            .auth_username = auth_username,
            .auth_password = auth_password,
            .selector = sel,
            .watcher = file_watcher,
            .startup_time = startup,
            .api_quotes_path = api_quotes_path,
            .config_ref = config,
            .rng = std.Random.DefaultPrng.init(@truncate(@as(u128, @bitCast(app_io.nowNs())))),
        };
    }

    /// Stop the HTTP server
    pub fn deinit(self: *HttpServer) void {
        posix_net.close(self.socket);
        self.log.info("http_server_stopped", .{});
    }

    /// Accept and serve a single connection (non-blocking)
    pub fn acceptAndServe(self: *HttpServer) !void {
        var client_addr: std.posix.sockaddr.storage = undefined;
        var client_addr_len: std.posix.socklen_t = @sizeOf(std.posix.sockaddr.storage);

        // Accept connection
        const client_fd = posix_net.accept(
            self.socket,
            @ptrCast(&client_addr),
            &client_addr_len,
            0,
        ) catch |err| {
            // Non-fatal errors that we can recover from
            switch (err) {
                error.WouldBlock => return, // No connection available
                error.ConnectionAborted => {
                    self.log.warn("http_accept_error", .{ .err = @errorName(err) });
                    return;
                },
                else => return err,
            }
        };
        defer posix_net.close(client_fd);

        // Read HTTP request (up to 64KB)
        var buf: [65536]u8 = undefined;
        const n = posix_net.recv(client_fd, &buf, 0) catch |err| {
            switch (err) {
                error.ConnectionResetByPeer => {
                    self.log.debug("http_client_disconnected", .{});
                    return;
                },
                else => {
                    self.log.warn("http_recv_error", .{ .err = @errorName(err) });
                    return;
                },
            }
        };

        if (n == 0) {
            // Client closed connection
            return;
        }

        var total = n;
        // Keep reading until the declared body has fully arrived
        if (HttpServer.parseContentLength(buf[0..total])) |content_length| {
            if (std.mem.indexOf(u8, buf[0..total], "\r\n\r\n")) |hdr_end| {
                const wanted = hdr_end + 4 + content_length;
                while (total < wanted and total < buf.len) {
                    const m = posix_net.recv(client_fd, buf[total..], 0) catch break;
                    if (m == 0) break;
                    total += m;
                }
            }
        }

        const request = buf[0..total];
        runtime.state.http_requests += 1;

        // Reject bodies larger than 64KB
        if (HttpServer.parseContentLength(request)) |content_length| {
            if (content_length > 65536) {
                try self.sendErrorResponse(client_fd, 413, "Content Too Large", "Request body too large");
                return;
            }
        }

        // Parse HTTP request: extract method and path
        var lines = std.mem.splitScalar(u8, request, '\n');
        const first_line = lines.next() orelse {
            self.sendResponse(client_fd, 400, "Bad Request", "text/plain", "Bad Request") catch {};
            return;
        };

        // Parse "GET /health HTTP/1.1"
        var parts = std.mem.splitScalar(u8, first_line, ' ');
        const method = parts.next() orelse {
            self.sendResponse(client_fd, 400, "Bad Request", "text/plain", "Bad Request") catch {};
            return;
        };
        const path_raw = parts.next() orelse {
            self.sendResponse(client_fd, 400, "Bad Request", "text/plain", "Bad Request") catch {};
            return;
        };

        // Trim trailing \r from path if present
        const full_path = if (std.mem.endsWith(u8, path_raw, "\r")) path_raw[0 .. path_raw.len - 1] else path_raw;
        // Split off the query string for routing
        const query_pos = std.mem.indexOfScalar(u8, full_path, '?');
        const path = if (query_pos) |q| full_path[0..q] else full_path;
        const query = if (query_pos) |q| full_path[q + 1 ..] else "";

        // Extract body (available for route handlers that need it)
        const body_info = HttpServer.findBody(request);
        const request_body = body_info.body;

        // Log request at debug level (not info - too noisy from K8s probes)
        self.log.debug("http_request", .{ .method = method, .path = path });

        // Route to handlers — method checking is done per handler
        if (std.mem.eql(u8, path, "/health")) {
            try self.handleHealth(client_fd, method);
        } else if (std.mem.eql(u8, path, "/ready")) {
            try self.handleReady(client_fd, method);
        } else if (try public_routes.handle(self.allocator, self.store, self.rng.random(), method, full_path, request)) |resp| {
            // Public read-only routes: /help, /quote, /n/:num, /tags
            defer resp.deinit(self.allocator);
            public_routes.send(client_fd, resp) catch |err| {
                self.log.debug("http_send_error", .{ .err = @errorName(err) });
            };
        } else if (std.mem.startsWith(u8, path, "/api/")) {
            // Gate API routes on api_enabled config flag
            if (!self.config_ref.api_enabled) {
                try self.sendErrorResponse(client_fd, 404, "Not Found", "Not Found");
                return;
            }
            // Auth required for all /api/ routes
            if (!self.checkAuth(request)) {
                runtime.state.auth_failures += 1;
                try self.sendUnauthorized(client_fd);
                return;
            }
            runtime.state.api_requests += 1;
            // Route to API handlers
            if (std.mem.eql(u8, path, "/api/quotes")) {
                try self.handleQuotes(client_fd, method, request_body);
            } else if (std.mem.startsWith(u8, path, "/api/quotes/")) {
                const id_str = path["/api/quotes/".len..];
                const id = std.fmt.parseInt(usize, id_str, 10) catch {
                    try self.sendErrorResponse(client_fd, 400, "Bad Request", "Invalid quote ID");
                    return;
                };
                try self.handleQuoteById(client_fd, method, id, request_body);
            } else if (std.mem.eql(u8, path, "/api/status")) {
                try self.handleStatus(client_fd, method);
            } else if (std.mem.eql(u8, path, "/api/config")) {
                try self.handleConfig(client_fd, method, request_body);
            } else if (std.mem.eql(u8, path, "/api/reload")) {
                try self.handleReload(client_fd, method);
            } else if (std.mem.eql(u8, path, "/api/maintenance")) {
                try self.handleMaintenance(client_fd, method, request_body);
            } else if (std.mem.eql(u8, path, "/api/debug")) {
                try self.handleDebug(client_fd, method, request_body);
            } else if (std.mem.eql(u8, path, "/api/stats")) {
                try self.handleStats(client_fd, method, query);
            } else if (std.mem.eql(u8, path, "/api/stats/reset")) {
                try self.handleStatsReset(client_fd, method);
            } else if (std.mem.eql(u8, path, "/api/logs")) {
                try self.handleLogs(client_fd, method, query);
            } else {
                try self.sendErrorResponse(client_fd, 404, "Not Found", "Not Found");
            }
        } else {
            try self.sendErrorResponse(client_fd, 404, "Not Found", "Not Found");
        }
    }

    /// Handle /health endpoint — GET only
    fn handleHealth(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8) !void {
        if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        const body = "{\"status\":\"ok\"}";
        try self.sendResponse(client_fd, 200, "OK", "application/json", body);
    }

    /// Handle /ready endpoint — GET only
    fn handleReady(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8) !void {
        if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }

        const quote_count = self.store.count();

        if (quote_count == 0) {
            // Not ready: no quotes loaded
            const body = "{\"status\":\"not_ready\",\"quotes\":0}";
            try self.sendResponse(client_fd, 503, "Service Unavailable", "application/json", body);
        } else {
            // Ready: quotes available
            var body_buf: [256]u8 = undefined;
            const body = try std.fmt.bufPrint(&body_buf, "{{\"status\":\"ready\",\"quotes\":{d}}}", .{quote_count});
            try self.sendResponse(client_fd, 200, "OK", "application/json", body);
        }
    }

    /// Handle /api/quotes endpoint — GET list, POST create
    fn handleQuotes(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, body: []const u8) !void {
        if (std.mem.eql(u8, method, "GET")) {
            var json_buf: std.ArrayList(u8) = .empty;
            defer json_buf.deinit(self.allocator);

            try json_buf.appendSlice(self.allocator, "{\"quotes\":[");
            const count = self.store.count();
            var i: usize = 0;
            while (i < count) : (i += 1) {
                if (i > 0) try json_buf.append(self.allocator, ',');
                const text = self.store.get(i) orelse continue;

                try json_buf.appendSlice(self.allocator, "{\"id\":");
                var id_buf: [32]u8 = undefined;
                const id_str = try std.fmt.bufPrint(&id_buf, "{d}", .{i});
                try json_buf.appendSlice(self.allocator, id_str);
                try json_buf.appendSlice(self.allocator, ",\"text\":\"");
                try appendJsonEscaped(&json_buf, self.allocator, text);
                var served_buf: [48]u8 = undefined;
                try json_buf.appendSlice(self.allocator, try std.fmt.bufPrint(&served_buf, "\",\"served\":{d},\"source\":", .{runtime.state.servedCount(text)}));
                if (self.store.quotes.items[i].source_path) |src| {
                    try json_buf.append(self.allocator, '"');
                    try appendJsonEscaped(&json_buf, self.allocator, src);
                    try json_buf.append(self.allocator, '"');
                } else {
                    try json_buf.appendSlice(self.allocator, "null");
                }
                const q = &self.store.quotes.items[i];
                try json_buf.appendSlice(self.allocator, ",\"author\":");
                if (q.author) |author| {
                    try json_buf.append(self.allocator, '"');
                    try appendJsonEscaped(&json_buf, self.allocator, author);
                    try json_buf.append(self.allocator, '"');
                } else {
                    try json_buf.appendSlice(self.allocator, "null");
                }
                try json_buf.appendSlice(self.allocator, ",\"tags\":[");
                for (q.tags, 0..) |tag, t| {
                    if (t > 0) try json_buf.append(self.allocator, ',');
                    try json_buf.append(self.allocator, '"');
                    try appendJsonEscaped(&json_buf, self.allocator, tag);
                    try json_buf.append(self.allocator, '"');
                }
                try json_buf.appendSlice(self.allocator, "]}");
            }
            var count_buf: [32]u8 = undefined;
            const count_str = try std.fmt.bufPrint(&count_buf, "],\"count\":{d}}}", .{count});
            try json_buf.appendSlice(self.allocator, count_str);

            try self.sendJsonResponse(client_fd, 200, "OK", json_buf.items);
        } else if (std.mem.eql(u8, method, "POST")) {
            const raw_text = extractTextField(body) catch {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "Invalid JSON body");
                return;
            };
            const decoded = try decodeJsonString(self.allocator, raw_text);
            defer self.allocator.free(decoded);
            const text = std.mem.trim(u8, decoded, " \t\n\r");
            if (text.len == 0) {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "Quote text cannot be empty");
                return;
            }

            const count = self.store.count();
            var i: usize = 0;
            while (i < count) : (i += 1) {
                if (std.mem.eql(u8, self.store.get(i) orelse "", text)) {
                    try self.sendErrorResponse(client_fd, 409, "Conflict", "Duplicate quote");
                    return;
                }
            }

            self.store.add(text) catch {
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to add quote");
                return;
            };

            self.writeApiQuotesFile() catch {
                // Best effort rollback to keep API response consistent with persistence contract.
                _ = self.store.removeQuote(self.store.count() - 1) catch {};
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to persist API quotes");
                return;
            };

            const new_id = self.store.count() - 1;
            var json_buf: std.ArrayList(u8) = .empty;
            defer json_buf.deinit(self.allocator);
            var id_buf: [32]u8 = undefined;
            const id_prefix = try std.fmt.bufPrint(&id_buf, "{{\"id\":{d},\"text\":\"", .{new_id});
            try json_buf.appendSlice(self.allocator, id_prefix);
            try appendJsonEscaped(&json_buf, self.allocator, text);
            try json_buf.appendSlice(self.allocator, "\"}");
            try self.sendJsonResponse(client_fd, 201, "Created", json_buf.items);
        } else {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
        }
    }

    /// Handle /api/quotes/:id endpoint — GET by id, PUT update, DELETE remove
    fn handleQuoteById(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, id: usize, body: []const u8) !void {
        if (std.mem.eql(u8, method, "GET")) {
            const text = self.store.get(id) orelse {
                try self.sendErrorResponse(client_fd, 404, "Not Found", "Quote not found");
                return;
            };

            var json_buf: std.ArrayList(u8) = .empty;
            defer json_buf.deinit(self.allocator);
            var id_buf: [32]u8 = undefined;
            const id_prefix = try std.fmt.bufPrint(&id_buf, "{{\"id\":{d},\"text\":\"", .{id});
            try json_buf.appendSlice(self.allocator, id_prefix);
            try appendJsonEscaped(&json_buf, self.allocator, text);
            try json_buf.appendSlice(self.allocator, "\"}");
            try self.sendJsonResponse(client_fd, 200, "OK", json_buf.items);
        } else if (std.mem.eql(u8, method, "PUT")) {
            if (self.store.get(id) == null) {
                try self.sendErrorResponse(client_fd, 404, "Not Found", "Quote not found");
                return;
            }

            const raw_text = extractTextField(body) catch {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "Invalid JSON body");
                return;
            };
            const decoded = try decodeJsonString(self.allocator, raw_text);
            defer self.allocator.free(decoded);
            const text = std.mem.trim(u8, decoded, " \t\n\r");
            if (text.len == 0) {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "Quote text cannot be empty");
                return;
            }

            self.store.removeQuote(id) catch {
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to update quote");
                return;
            };
            self.store.add(text) catch {
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to add updated quote");
                return;
            };

            self.writeApiQuotesFile() catch {
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to persist API quotes");
                return;
            };

            const new_id = self.store.count() - 1;
            var json_buf: std.ArrayList(u8) = .empty;
            defer json_buf.deinit(self.allocator);
            var id_buf: [32]u8 = undefined;
            const id_prefix = try std.fmt.bufPrint(&id_buf, "{{\"id\":{d},\"text\":\"", .{new_id});
            try json_buf.appendSlice(self.allocator, id_prefix);
            try appendJsonEscaped(&json_buf, self.allocator, text);
            try json_buf.appendSlice(self.allocator, "\"}");
            try self.sendJsonResponse(client_fd, 200, "OK", json_buf.items);
        } else if (std.mem.eql(u8, method, "DELETE")) {
            if (self.store.get(id) == null) {
                try self.sendErrorResponse(client_fd, 404, "Not Found", "Quote not found");
                return;
            }

            self.store.removeQuote(id) catch {
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to delete quote");
                return;
            };

            self.writeApiQuotesFile() catch {
                try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to persist API quotes");
                return;
            };

            try self.sendJsonResponse(client_fd, 200, "OK", "{\"status\":\"ok\"}");
        } else {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
        }
    }

    fn writeApiQuotesFile(self: *HttpServer) !void {
        var json_buf: std.ArrayList(u8) = .empty;
        defer json_buf.deinit(self.allocator);

        try json_buf.appendSlice(self.allocator, "{\"quotes\":[");
        const count = self.store.count();
        var emitted: usize = 0;
        var i: usize = 0;
        while (i < count) : (i += 1) {
            const text = self.store.get(i) orelse continue;
            if (emitted > 0) try json_buf.append(self.allocator, ',');
            emitted += 1;

            try json_buf.appendSlice(self.allocator, "{\"text\":\"");
            try appendJsonEscaped(&json_buf, self.allocator, text);
            try json_buf.append(self.allocator, '"');
            // Persist metadata too, so a reload keeps author and tags
            if (self.store.getQuote(i)) |q| {
                if (q.author) |author| {
                    try json_buf.appendSlice(self.allocator, ",\"author\":\"");
                    try appendJsonEscaped(&json_buf, self.allocator, author);
                    try json_buf.append(self.allocator, '"');
                }
                if (q.tags.len > 0) {
                    try json_buf.appendSlice(self.allocator, ",\"tags\":[");
                    for (q.tags, 0..) |tag, t| {
                        if (t > 0) try json_buf.append(self.allocator, ',');
                        try json_buf.append(self.allocator, '"');
                        try appendJsonEscaped(&json_buf, self.allocator, tag);
                        try json_buf.append(self.allocator, '"');
                    }
                    try json_buf.append(self.allocator, ']');
                }
            }
            try json_buf.append(self.allocator, '}');
        }
        try json_buf.appendSlice(self.allocator, "]}");

        try std.Io.Dir.cwd().writeFile(app_io.value, .{
            .sub_path = self.api_quotes_path,
            .data = json_buf.items,
            .flags = .{ .truncate = true },
        });
    }

    /// Handle /api/status endpoint — GET only, requires auth
    fn handleStatus(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8) !void {
        if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        const now = app_io.nowNs();
        const uptime_ns = now - self.startup_time;
        const uptime_s = @divTrunc(uptime_ns, std.time.ns_per_s);
        const status_str: []const u8 = if (runtime.state.maintenance) "maintenance" else "ok";
        const mode_str = self.selector.mode.asString();
        const quote_count = self.store.count();
        const interval = self.watcher.interval_seconds;

        var json_buf: [512]u8 = undefined;
        const body = try std.fmt.bufPrint(
            &json_buf,
            "{{\"status\":\"{s}\",\"quotes\":{d},\"mode\":\"{s}\",\"uptime_seconds\":{d},\"polling_interval\":{d},\"maintenance\":{},\"debug\":{},\"served_total\":{d}}}",
            .{ status_str, quote_count, mode_str, uptime_s, interval, runtime.state.maintenance, runtime.state.debug, runtime.state.totalServed() },
        );
        try self.sendJsonResponse(client_fd, 200, "OK", body);
    }

    /// Handle /api/config endpoint — GET config, PATCH update runtime settings
    fn handleConfig(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, body: []const u8) !void {
        if (std.mem.eql(u8, method, "GET")) {
            var json_buf: std.ArrayList(u8) = .empty;
            defer json_buf.deinit(self.allocator);

            try json_buf.appendSlice(self.allocator, "{\"selection_mode\":\"");
            try json_buf.appendSlice(self.allocator, self.selector.mode.asString());

            var interval_buf: [64]u8 = undefined;
            const interval_part = try std.fmt.bufPrint(
                &interval_buf,
                "\",\"polling_interval\":{d},\"directories\":[",
                .{self.watcher.interval_seconds},
            );
            try json_buf.appendSlice(self.allocator, interval_part);

            for (self.config_ref.directories, 0..) |dir, i| {
                if (i > 0) try json_buf.append(self.allocator, ',');
                try json_buf.append(self.allocator, '"');
                try appendJsonEscaped(&json_buf, self.allocator, dir);
                try json_buf.append(self.allocator, '"');
            }
            try json_buf.appendSlice(self.allocator, "]}");

            try self.sendJsonResponse(client_fd, 200, "OK", json_buf.items);
        } else if (std.mem.eql(u8, method, "PATCH")) {
            var changed = false;

            // Update selection_mode if present
            if (extractJsonStringField(body, "selection_mode")) |mode_str| {
                if (config_mod.SelectionMode.fromString(mode_str)) |new_mode| {
                    // Create new selector first (in case init fails, old one still intact)
                    const new_selector = selector_mod.Selector.init(
                        self.selector.allocator,
                        new_mode,
                        self.store.count(),
                    ) catch |err| {
                        self.log.err("selector_reinit_failed", .{ .err = @errorName(err) });
                        try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Failed to update selection mode");
                        return;
                    };
                    self.selector.deinit();
                    self.selector.* = new_selector;
                    changed = true;
                }
            }

            // Update polling_interval if present
            if (extractJsonUintField(body, "polling_interval")) |new_interval| {
                self.watcher.interval_seconds = @as(u64, new_interval);
                changed = true;
            }

            if (changed) {
                try self.sendJsonResponse(client_fd, 200, "OK", "{\"status\":\"ok\"}");
            } else {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "No valid fields to update");
            }
        } else {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
        }
    }

    /// Handle /api/reload endpoint — POST only, triggers store rebuild
    fn handleReload(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8) !void {
        if (!std.mem.eql(u8, method, "POST")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        self.store.build(self.config_ref.directories) catch |err| {
            self.log.err("reload_failed", .{ .err = @errorName(err) });
            try self.sendErrorResponse(client_fd, 500, "Internal Server Error", "Reload failed");
            return;
        };
        self.selector.reset(self.store.count()) catch {};
        runtime.state.reloads += 1;
        self.log.info("api_reload", .{ .quotes = self.store.count() });

        var json_buf: [128]u8 = undefined;
        const resp_body = try std.fmt.bufPrint(
            &json_buf,
            "{{\"status\":\"ok\",\"quotes\":{d}}}",
            .{self.store.count()},
        );
        try self.sendJsonResponse(client_fd, 200, "OK", resp_body);
    }

    /// Handle /api/maintenance — GET current state, POST {"enabled":bool,"message":"..."}
    /// While enabled, TCP/UDP clients receive the maintenance message instead of a quote.
    fn handleMaintenance(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, body: []const u8) !void {
        if (std.mem.eql(u8, method, "POST")) {
            const enabled_opt: ?bool = extractBoolField(body, "enabled") catch |err| switch (err) {
                error.FieldNotFound => null,
                else => {
                    try self.sendErrorResponse(client_fd, 400, "Bad Request", "Invalid 'enabled' field");
                    return;
                },
            };
            const message_raw = extractJsonStringField(body, "message");
            if (enabled_opt == null and message_raw == null) {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "Missing or invalid 'enabled' field");
                return;
            }
            if (message_raw) |raw| {
                const msg = try decodeJsonString(self.allocator, raw);
                defer self.allocator.free(msg);
                runtime.state.setMaintenanceMessage(msg);
            }
            if (enabled_opt) |enabled| {
                if (enabled != runtime.state.maintenance) {
                    self.log.info("maintenance_mode_changed", .{ .enabled = enabled });
                }
                runtime.state.maintenance = enabled;
            }
        } else if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }

        var json_buf: std.ArrayList(u8) = .empty;
        defer json_buf.deinit(self.allocator);
        try json_buf.appendSlice(self.allocator, if (runtime.state.maintenance) "{\"status\":\"ok\",\"maintenance\":true,\"message\":\"" else "{\"status\":\"ok\",\"maintenance\":false,\"message\":\"");
        try appendJsonEscaped(&json_buf, self.allocator, runtime.state.maintenanceMessage());
        try json_buf.appendSlice(self.allocator, "\"}");
        try self.sendJsonResponse(client_fd, 200, "OK", json_buf.items);
    }

    /// Handle /api/debug — GET current state, POST {"enabled":bool}
    /// Debug mode logs every request and appends internal state to QOTD replies.
    fn handleDebug(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, body: []const u8) !void {
        if (std.mem.eql(u8, method, "POST")) {
            const enabled = extractBoolField(body, "enabled") catch {
                try self.sendErrorResponse(client_fd, 400, "Bad Request", "Missing or invalid 'enabled' field");
                return;
            };
            if (enabled != runtime.state.debug) {
                // Log before disabling / after enabling so the change is visible at info level
                self.log.info("debug_mode_changed", .{ .enabled = enabled });
            }
            runtime.state.setDebug(enabled);
        } else if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        const resp = if (runtime.state.debug) "{\"status\":\"ok\",\"debug\":true}" else "{\"status\":\"ok\",\"debug\":false}";
        try self.sendJsonResponse(client_fd, 200, "OK", resp);
    }

    /// Handle /api/stats — GET serving statistics. Query: top=N (default 10, max 100)
    fn handleStats(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, query: []const u8) !void {
        if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        const rt = &runtime.state;
        const now = app_io.nowNs();
        const top_n: usize = @min(queryUint(query, "top") orelse 10, 100);

        var out: std.ArrayList(u8) = .empty;
        defer out.deinit(self.allocator);

        const since_ns = if (rt.stats_since_ns != 0) rt.stats_since_ns else self.startup_time;
        try out.print(
            self.allocator,
            "{{\"uptime_seconds\":{d},\"stats_window_seconds\":{d},\"quotes\":{d},\"mode\":\"{s}\",\"maintenance\":{},\"debug\":{}," ++
                "\"served\":{{\"total\":{d},\"tcp\":{d},\"udp\":{d},\"maintenance\":{d},\"empty\":{d}}}," ++
                "\"http\":{{\"requests\":{d},\"api_requests\":{d},\"auth_failures\":{d}}},\"reloads\":{d},",
            .{
                @divTrunc(now - self.startup_time, std.time.ns_per_s),
                @divTrunc(now - since_ns, std.time.ns_per_s),
                self.store.count(),
                self.selector.mode.asString(),
                rt.maintenance,
                rt.debug,
                rt.totalServed(),
                rt.tcp_served,
                rt.udp_served,
                rt.maintenance_served,
                rt.empty_responses,
                rt.http_requests,
                rt.api_requests,
                rt.auth_failures,
                rt.reloads,
            },
        );
        if (rt.last_served_ns != 0) {
            try out.print(self.allocator, "\"last_served_seconds_ago\":{d},", .{@divTrunc(now - rt.last_served_ns, std.time.ns_per_s)});
        } else {
            try out.appendSlice(self.allocator, "\"last_served_seconds_ago\":null,");
        }

        const md = self.store.metadata;
        try out.print(
            self.allocator,
            "\"store\":{{\"files_parsed\":{d},\"quotes_loaded\":{d},\"duplicates_removed\":{d}}},",
            .{ md.total_files_parsed, md.total_quotes_loaded, md.duplicates_removed },
        );

        var tl: [runtime.TIMELINE_MINUTES]u32 = undefined;
        rt.timeline(&tl);
        try out.appendSlice(self.allocator, "\"timeline_per_minute\":[");
        for (tl, 0..) |v, k| {
            if (k > 0) try out.append(self.allocator, ',');
            try out.print(self.allocator, "{d}", .{v});
        }
        try out.appendSlice(self.allocator, "],");

        // Top N most served quotes (simple insertion into a small sorted list)
        var top_ids: [100]usize = undefined;
        var top_counts: [100]u64 = undefined;
        var top_len: usize = 0;
        var never_served: usize = 0;
        const count = self.store.count();
        var i: usize = 0;
        while (i < count) : (i += 1) {
            const c = rt.servedCount(self.store.get(i).?);
            if (c == 0) {
                never_served += 1;
                continue;
            }
            if (top_n == 0) continue;
            if (top_len == top_n and c <= top_counts[top_len - 1]) continue;
            var pos = if (top_len < top_n) top_len else top_n - 1;
            if (top_len < top_n) top_len += 1;
            while (pos > 0 and top_counts[pos - 1] < c) : (pos -= 1) {
                top_counts[pos] = top_counts[pos - 1];
                top_ids[pos] = top_ids[pos - 1];
            }
            top_counts[pos] = c;
            top_ids[pos] = i;
        }
        try out.print(self.allocator, "\"never_served\":{d},\"top\":[", .{never_served});
        for (top_ids[0..top_len], top_counts[0..top_len], 0..) |id, c, k| {
            if (k > 0) try out.append(self.allocator, ',');
            try out.print(self.allocator, "{{\"id\":{d},\"served\":{d},\"text\":\"", .{ id, c });
            try appendJsonEscaped(&out, self.allocator, self.store.get(id).?);
            try out.appendSlice(self.allocator, "\"}");
        }
        try out.appendSlice(self.allocator, "]}");

        try self.sendJsonResponse(client_fd, 200, "OK", out.items);
    }

    /// Handle /api/stats/reset — POST clears all counters
    fn handleStatsReset(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8) !void {
        if (!std.mem.eql(u8, method, "POST")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        runtime.state.resetStats();
        self.log.info("stats_reset", .{});
        try self.sendJsonResponse(client_fd, 200, "OK", "{\"status\":\"ok\"}");
    }

    /// Handle /api/logs — GET recent log lines.
    /// Query: since=SEQ (only lines after SEQ), limit=N (default 200), level=debug|info|warn|error
    fn handleLogs(self: *HttpServer, client_fd: std.posix.socket_t, method: []const u8, query: []const u8) !void {
        if (!std.mem.eql(u8, method, "GET")) {
            try self.sendErrorResponse(client_fd, 405, "Method Not Allowed", "Method Not Allowed");
            return;
        }
        const ring = &logger.ring;
        const limit: u64 = @max(@min(queryUint(query, "limit") orelse 200, logger.RING_SIZE), 1);
        const since: u64 = queryUint(query, "since") orelse 0;
        const min_level: logger.Level = if (queryParam(query, "level")) |lv| parseLevel(lv) orelse .debug else .debug;

        // Walk backwards from the newest line to collect up to `limit` matches
        var seqs: [logger.RING_SIZE]u64 = undefined;
        var n: usize = 0;
        var seq = ring.next_seq;
        const floor = @max(ring.oldestSeq(), since + 1);
        while (seq > floor and n < limit) {
            seq -= 1;
            const e = ring.get(seq) orelse break;
            if (@backingInt(e.level) < @backingInt(min_level)) continue;
            seqs[n] = seq;
            n += 1;
        }

        var out: std.ArrayList(u8) = .empty;
        defer out.deinit(self.allocator);
        try out.print(self.allocator, "{{\"next_seq\":{d},\"debug\":{},\"lines\":[", .{ ring.next_seq, runtime.state.debug });
        var k: usize = n;
        var first = true;
        while (k > 0) {
            k -= 1;
            const e = ring.get(seqs[k]).?;
            if (!first) try out.append(self.allocator, ',');
            first = false;
            try out.print(self.allocator, "{{\"seq\":{d},\"ts\":{d},\"level\":\"{s}\",\"message\":\"", .{ e.seq, e.ts_ms, e.level.asString() });
            try appendJsonEscaped(&out, self.allocator, e.message());
            try out.appendSlice(self.allocator, "\"}");
        }
        try out.appendSlice(self.allocator, "]}");
        try self.sendJsonResponse(client_fd, 200, "OK", out.items);
    }

    /// Send a JSON response with the given status and body
    fn sendJsonResponse(
        self: *HttpServer,
        client_fd: std.posix.socket_t,
        status_code: u16,
        status_text: []const u8,
        body: []const u8,
    ) !void {
        try self.sendResponse(client_fd, status_code, status_text, "application/json", body);
    }

    /// Send a JSON error response: {"error":"<msg>","code":<status>}
    fn sendErrorResponse(
        self: *HttpServer,
        client_fd: std.posix.socket_t,
        status_code: u16,
        status_text: []const u8,
        error_message: []const u8,
    ) !void {
        var body_buf: [512]u8 = undefined;
        const body = try std.fmt.bufPrint(
            &body_buf,
            "{{\"error\":\"{s}\",\"code\":{d}}}",
            .{ error_message, status_code },
        );
        try self.sendResponse(client_fd, status_code, status_text, "application/json", body);
    }

    /// Find the body portion of an HTTP request (after \r\n\r\n separator)
    fn findBody(request: []const u8) struct { headers_end: usize, body: []const u8 } {
        if (std.mem.indexOf(u8, request, "\r\n\r\n")) |pos| {
            return .{ .headers_end = pos + 4, .body = request[pos + 4 ..] };
        }
        return .{ .headers_end = request.len, .body = "" };
    }

    /// Parse the Content-Length header value from the headers portion of a request.
    /// Returns null if the header is absent or the value is not a valid integer.
    fn parseContentLength(request: []const u8) ?usize {
        // Only scan the headers section (before \r\n\r\n)
        const headers_end = if (std.mem.indexOf(u8, request, "\r\n\r\n")) |pos| pos else request.len;
        const headers = request[0..headers_end];

        // Try standard title-case form first (most common)
        const needle = "Content-Length: ";
        if (std.mem.indexOf(u8, headers, needle)) |idx| {
            const value_start = idx + needle.len;
            var value_end = value_start;
            while (value_end < headers.len and headers[value_end] != '\r' and headers[value_end] != '\n') {
                value_end += 1;
            }
            return std.fmt.parseInt(usize, headers[value_start..value_end], 10) catch null;
        }

        // Fallback: lowercase form (some clients send this)
        const needle_lower = "content-length: ";
        if (std.mem.indexOf(u8, headers, needle_lower)) |idx| {
            const value_start = idx + needle_lower.len;
            var value_end = value_start;
            while (value_end < headers.len and headers[value_end] != '\r' and headers[value_end] != '\n') {
                value_end += 1;
            }
            return std.fmt.parseInt(usize, headers[value_start..value_end], 10) catch null;
        }

        return null;
    }

    /// Check Basic Auth credentials from raw request bytes.
    /// Returns true if credentials match self.auth_username / self.auth_password.
    fn checkAuth(self: *HttpServer, request: []const u8) bool {
        const auth_prefix = "Authorization: Basic ";
        const auth_pos = std.mem.indexOf(u8, request, auth_prefix) orelse return false;
        const token_start = auth_pos + auth_prefix.len;

        // Find end of token (at \r or \n)
        var token_end = token_start;
        while (token_end < request.len and
            request[token_end] != '\r' and
            request[token_end] != '\n')
        {
            token_end += 1;
        }
        if (token_end == token_start) return false;
        const encoded = request[token_start..token_end];

        // Decode base64
        var decoded_buf: [256]u8 = undefined;
        const dec = std.base64.standard.Decoder;
        const decoded_len = dec.calcSizeForSlice(encoded) catch return false;
        if (decoded_len > decoded_buf.len) return false;
        dec.decode(decoded_buf[0..decoded_len], encoded) catch return false;
        const decoded = decoded_buf[0..decoded_len];

        // Split on ':' to get username:password
        const colon_pos = std.mem.indexOfScalar(u8, decoded, ':') orelse return false;
        const username = decoded[0..colon_pos];
        const password = decoded[colon_pos + 1 ..];

        // Constant-time-ish comparison (both must match)
        return std.mem.eql(u8, username, self.auth_username) and
            std.mem.eql(u8, password, self.auth_password);
    }

    /// Send 401 Unauthorized with WWW-Authenticate challenge
    fn sendUnauthorized(self: *HttpServer, client_fd: std.posix.socket_t) !void {
        self.log.debug("http_auth_failed", .{ .status = 401 });
        const body = "{\"error\":\"Unauthorized\",\"code\":401}";
        var response_buf: [512]u8 = undefined;
        const response = try std.fmt.bufPrint(
            &response_buf,
            "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nWWW-Authenticate: Basic realm=\"quotez\"\r\nContent-Length: {d}\r\n\r\n{s}",
            .{ body.len, body },
        );
        _ = posix_net.send(client_fd, response, 0) catch {};
    }

    /// Send HTTP/1.1 response
    fn sendResponse(
        self: *HttpServer,
        client_fd: std.posix.socket_t,
        status_code: u16,
        status_text: []const u8,
        content_type: []const u8,
        body: []const u8,
    ) !void {
        // Headers go out first; the body is streamed so responses of any size work
        var header_buf: [256]u8 = undefined;
        const header = try std.fmt.bufPrint(
            &header_buf,
            "HTTP/1.1 {d} {s}\r\nContent-Type: {s}\r\nContent-Length: {d}\r\nConnection: close\r\n\r\n",
            .{ status_code, status_text, content_type, body.len },
        );

        for ([_][]const u8{ header, body }) |chunk| {
            sendAll(client_fd, chunk) catch |err| {
                switch (err) {
                    error.BrokenPipe, error.ConnectionResetByPeer => {
                        // Client disconnected, ignore
                        self.log.debug("http_client_disconnected", .{});
                    },
                    else => self.log.warn("http_send_error", .{ .err = @errorName(err) }),
                }
                return;
            };
        }
    }
};

fn sendAll(fd: std.posix.socket_t, data: []const u8) !void {
    var sent: usize = 0;
    while (sent < data.len) {
        const n = try posix_net.send(fd, data[sent..], 0);
        if (n == 0) return error.BrokenPipe;
        sent += n;
    }
}

/// Return the raw value of `name` in a query string like "a=1&b=2"
fn queryParam(query: []const u8, name: []const u8) ?[]const u8 {
    var it = std.mem.splitScalar(u8, query, '&');
    while (it.next()) |pair| {
        const eq = std.mem.indexOfScalar(u8, pair, '=') orelse continue;
        if (std.mem.eql(u8, pair[0..eq], name)) return pair[eq + 1 ..];
    }
    return null;
}

fn queryUint(query: []const u8, name: []const u8) ?u64 {
    const v = queryParam(query, name) orelse return null;
    return std.fmt.parseInt(u64, v, 10) catch null;
}

fn parseLevel(s: []const u8) ?logger.Level {
    if (std.ascii.eqlIgnoreCase(s, "debug")) return .debug;
    if (std.ascii.eqlIgnoreCase(s, "info")) return .info;
    if (std.ascii.eqlIgnoreCase(s, "warn")) return .warn;
    if (std.ascii.eqlIgnoreCase(s, "error") or std.ascii.eqlIgnoreCase(s, "err")) return .err;
    return null;
}

/// Decode the escapes of a raw JSON string value (\n, \", \\, \uXXXX, ...).
/// Caller owns the returned slice.
fn decodeJsonString(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.ensureTotalCapacity(allocator, raw.len);
    var i: usize = 0;
    while (i < raw.len) : (i += 1) {
        const c = raw[i];
        if (c != '\\' or i + 1 >= raw.len) {
            try out.append(allocator, c);
            continue;
        }
        i += 1;
        switch (raw[i]) {
            'n' => try out.append(allocator, '\n'),
            't' => try out.append(allocator, '\t'),
            'r' => try out.append(allocator, '\r'),
            'b' => try out.append(allocator, 8),
            'f' => try out.append(allocator, 12),
            'u' => {
                if (i + 4 >= raw.len) {
                    try out.append(allocator, 'u');
                    continue;
                }
                var cp: u21 = std.fmt.parseInt(u16, raw[i + 1 .. i + 5], 16) catch {
                    try out.append(allocator, 'u');
                    continue;
                };
                i += 4;
                // Surrogate pair
                if (cp >= 0xD800 and cp <= 0xDBFF and i + 6 < raw.len and raw[i + 1] == '\\' and raw[i + 2] == 'u') {
                    if (std.fmt.parseInt(u16, raw[i + 3 .. i + 7], 16)) |lo| {
                        if (lo >= 0xDC00 and lo <= 0xDFFF) {
                            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            i += 6;
                        }
                    } else |_| {}
                }
                var enc: [4]u8 = undefined;
                const len = std.unicode.utf8Encode(cp, &enc) catch {
                    try out.appendSlice(allocator, "\u{FFFD}");
                    continue;
                };
                try out.appendSlice(allocator, enc[0..len]);
            },
            else => |e| try out.append(allocator, e), // \" \\ \/
        }
    }
    return out.toOwnedSlice(allocator);
}

/// Extract a JSON string field value: finds "field_name":"value" in body
/// Returns slice into body (not allocated)
fn extractJsonStringField(body: []const u8, field_name: []const u8) ?[]const u8 {
    var search_buf: [64]u8 = undefined;
    const key = std.fmt.bufPrint(&search_buf, "\"{s}\":\"", .{field_name}) catch return null;
    const start_pos = std.mem.indexOf(u8, body, key) orelse return null;
    const value_start = start_pos + key.len;
    var i = value_start;
    while (i < body.len) {
        if (body[i] == '\\') {
            i += 2;
            continue;
        }
        if (body[i] == '"') break;
        i += 1;
    }
    if (i >= body.len) return null;
    return body[value_start..i];
}

/// Extract a JSON unsigned integer field value: finds "field_name": N in body
fn extractJsonUintField(body: []const u8, field_name: []const u8) ?u32 {
    var search_buf: [64]u8 = undefined;
    const key = std.fmt.bufPrint(&search_buf, "\"{s}\":", .{field_name}) catch return null;
    const start_pos = std.mem.indexOf(u8, body, key) orelse return null;
    var i = start_pos + key.len;
    // Skip whitespace
    while (i < body.len and (body[i] == ' ' or body[i] == '\t')) i += 1;
    if (i >= body.len) return null;
    // Parse digits
    var result: u32 = 0;
    var found_digit = false;
    while (i < body.len and body[i] >= '0' and body[i] <= '9') {
        result = result * 10 + (body[i] - '0');
        found_digit = true;
        i += 1;
    }
    if (!found_digit) return null;
    return result;
}

/// Extract a JSON boolean field value: finds "field_name": true/false in body
fn extractBoolField(body: []const u8, field_name: []const u8) !bool {
    var search_buf: [64]u8 = undefined;
    const key = try std.fmt.bufPrint(&search_buf, "\"{s}\":", .{field_name});
    const start_pos = std.mem.indexOf(u8, body, key) orelse return error.FieldNotFound;
    var i = start_pos + key.len;
    // Skip whitespace
    while (i < body.len and (body[i] == ' ' or body[i] == '\t')) i += 1;
    if (i >= body.len) return error.FieldNotFound;
    if (std.mem.startsWith(u8, body[i..], "true")) return true;
    if (std.mem.startsWith(u8, body[i..], "false")) return false;
    return error.InvalidBoolValue;
}

/// Extract "text" field from JSON body like {"text":"..."}
/// Returns the text value (not allocated — points into body slice)
fn extractTextField(body: []const u8) ![]const u8 {
    const key = "\"text\":\"";
    const start_pos = std.mem.indexOf(u8, body, key) orelse return error.MissingTextField;
    const value_start = start_pos + key.len;

    var i = value_start;
    while (i < body.len) {
        if (body[i] == '\\') {
            i += 2;
            continue;
        }
        if (body[i] == '"') break;
        i += 1;
    }
    if (i >= body.len) return error.MalformedJson;

    const text = body[value_start..i];
    return std.mem.trim(u8, text, " \t\n\r");
}

/// Append a string to an ArrayList with JSON escaping
fn appendJsonEscaped(buf: *std.ArrayList(u8), allocator: std.mem.Allocator, s: []const u8) !void {
    for (s) |c| {
        switch (c) {
            '"' => try buf.appendSlice(allocator, "\\\""),
            '\\' => try buf.appendSlice(allocator, "\\\\"),
            '\n' => try buf.appendSlice(allocator, "\\n"),
            '\r' => try buf.appendSlice(allocator, "\\r"),
            '\t' => try buf.appendSlice(allocator, "\\t"),
            0...8, 11, 12, 14...31, 127 => try buf.print(allocator, "\\u{x:0>4}", .{c}),
            else => try buf.append(allocator, c),
        }
    }
}

fn testSendHttpRequestOnce(server: *HttpServer, port: u16, request: []const u8, response_buf: []u8) ![]const u8 {
    const client_fd = try posix_net.socket(
        std.posix.AF.INET,
        std.posix.SOCK.STREAM,
        std.posix.IPPROTO.TCP,
    );
    defer posix_net.close(client_fd);

    const parsed_bytes = try net.parseIpv4("127.0.0.1");
    const addr = std.posix.sockaddr.in{
        .family = std.posix.AF.INET,
        .port = std.mem.nativeToBig(u16, port),
        .addr = parsed_bytes,
    };

    try posix_net.connect(client_fd, @ptrCast(&addr), @sizeOf(std.posix.sockaddr.in));
    _ = try posix_net.send(client_fd, request, 0);
    try server.acceptAndServe();
    // The server closes the connection after responding: read until EOF
    var n: usize = 0;
    while (n < response_buf.len) {
        const m = try posix_net.recv(client_fd, response_buf[n..], 0);
        if (m == 0) break;
        n += m;
    }
    return response_buf[0..n];
}

fn testResponseBody(response: []const u8) []const u8 {
    const sep = std.mem.indexOf(u8, response, "\r\n\r\n") orelse return "";
    return response[sep + 4 ..];
}

// Tests
test "http server initialization" {
    const allocator = std.testing.allocator;

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    // Try to bind to a high port (non-privileged)
    var server = HttpServer.init(allocator, "127.0.0.1", 18080, &store, "admin", "quotez", undefined, undefined, undefined, "api-managed.json", undefined) catch |err| {
        // May fail if port is in use, which is okay for testing
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    // Server should be initialized
    try std.testing.expectEqual(@as(u16, 18080), std.mem.bigToNative(u16, server.address.port));
}

test "parseContentLength with valid header" {
    const request = "POST /quotes HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 42\r\n\r\n{\"text\":\"hello\"}";
    const result = HttpServer.parseContentLength(request);
    try std.testing.expectEqual(@as(?usize, 42), result);
}

test "parseContentLength with missing header" {
    const request = "GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n";
    const result = HttpServer.parseContentLength(request);
    try std.testing.expectEqual(@as(?usize, null), result);
}

test "parseContentLength with lowercase header" {
    const request = "POST /quotes HTTP/1.1\r\nHost: localhost\r\ncontent-length: 100\r\n\r\nbody";
    const result = HttpServer.parseContentLength(request);
    try std.testing.expectEqual(@as(?usize, 100), result);
}

test "findBody with body present" {
    const request = "POST /q HTTP/1.1\r\nContent-Length: 5\r\n\r\nhello";
    const result = HttpServer.findBody(request);
    try std.testing.expectEqualStrings("hello", result.body);
    try std.testing.expectEqual(@as(usize, 39), result.headers_end);
}

test "findBody without body" {
    const request = "GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n";
    const result = HttpServer.findBody(request);
    try std.testing.expectEqualStrings("", result.body);
}

test "findBody with no CRLF separator" {
    const request = "GET /health HTTP/1.1";
    const result = HttpServer.findBody(request);
    try std.testing.expectEqualStrings("", result.body);
    try std.testing.expectEqual(request.len, result.headers_end);
}

test "sendErrorResponse json format" {
    // Test that the JSON body format string produces valid JSON
    var body_buf: [512]u8 = undefined;
    const body = try std.fmt.bufPrint(
        &body_buf,
        "{{\"error\":\"{s}\",\"code\":{d}}}",
        .{ "Not Found", 404 },
    );
    try std.testing.expectEqualStrings("{\"error\":\"Not Found\",\"code\":404}", body);
}

test "sendErrorResponse json format 413" {
    var body_buf: [512]u8 = undefined;
    const body = try std.fmt.bufPrint(
        &body_buf,
        "{{\"error\":\"{s}\",\"code\":{d}}}",
        .{ "Request body too large", 413 },
    );
    try std.testing.expectEqualStrings("{\"error\":\"Request body too large\",\"code\":413}", body);
}

test "checkAuth with valid credentials" {
    const allocator = std.testing.allocator;
    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    // Construct server directly without binding a socket (auth doesn't use socket)
    var server = HttpServer{
        .socket = -1,
        .address = std.mem.zeroes(std.posix.sockaddr.in),
        .store = &store,
        .log = logger.Logger.init(),
        .allocator = allocator,
        .auth_username = "admin",
        .auth_password = "quotez",
        .selector = undefined,
        .watcher = undefined,
        .startup_time = undefined,
        .api_quotes_path = "api-managed.json",
        .config_ref = undefined,
    };

    // "admin:quotez" base64-encoded is "YWRtaW46cXVvdGV6"
    const request = "GET /api/quotes HTTP/1.1\r\nHost: localhost\r\nAuthorization: Basic YWRtaW46cXVvdGV6\r\n\r\n";
    try std.testing.expect(server.checkAuth(request));
}

test "checkAuth with invalid credentials" {
    const allocator = std.testing.allocator;
    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    var server = HttpServer{
        .socket = -1,
        .address = std.mem.zeroes(std.posix.sockaddr.in),
        .store = &store,
        .log = logger.Logger.init(),
        .allocator = allocator,
        .auth_username = "admin",
        .auth_password = "quotez",
        .selector = undefined,
        .watcher = undefined,
        .startup_time = undefined,
        .api_quotes_path = "api-managed.json",
        .config_ref = undefined,
    };

    // "wrong:wrong" base64-encoded is "d3Jvbmc6d3Jvbmc="
    const request = "GET /api/quotes HTTP/1.1\r\nHost: localhost\r\nAuthorization: Basic d3Jvbmc6d3Jvbmc=\r\n\r\n";
    try std.testing.expect(!server.checkAuth(request));
}

test "checkAuth with missing Authorization header" {
    const allocator = std.testing.allocator;
    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();

    var server = HttpServer{
        .socket = -1,
        .address = std.mem.zeroes(std.posix.sockaddr.in),
        .store = &store,
        .log = logger.Logger.init(),
        .allocator = allocator,
        .auth_username = "admin",
        .auth_password = "quotez",
        .selector = undefined,
        .watcher = undefined,
        .startup_time = undefined,
        .api_quotes_path = "api-managed.json",
        .config_ref = undefined,
    };

    const request = "GET /api/quotes HTTP/1.1\r\nHost: localhost\r\n\r\n";
    try std.testing.expect(!server.checkAuth(request));
}

test "extractTextField parses valid body" {
    const body = "{\"text\":\"Hello world\"}";
    const text = try extractTextField(body);
    try std.testing.expectEqualStrings("Hello world", text);
}

test "extractTextField handles escaped quotes" {
    const body = "{\"text\":\"Hello \\\"quoted\\\" world\"}";
    const text = try extractTextField(body);
    try std.testing.expectEqualStrings("Hello \\\"quoted\\\" world", text);
}

test "extractTextField rejects malformed bodies" {
    try std.testing.expectError(error.MissingTextField, extractTextField("{\"message\":\"x\"}"));
    try std.testing.expectError(error.MalformedJson, extractTextField("{\"text\":\"unterminated}"));
}

test "appendJsonEscaped escapes special characters" {
    const allocator = std.testing.allocator;
    var buf: std.ArrayList(u8) = .empty;
    defer buf.deinit(allocator);

    try appendJsonEscaped(&buf, allocator, "a\"b\\c\nd\re\tf");
    try std.testing.expectEqualStrings("a\\\"b\\\\c\\nd\\re\\tf", buf.items);
}

test "api quotes CRUD endpoint behavior" {
    const allocator = std.testing.allocator;
    const auth_header = "Authorization: Basic YWRtaW46cXVvdGV6\r\n";

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();
    try store.add("Initial quote");

    var server = HttpServer.init(allocator, "127.0.0.1", 18081, &store, "admin", "quotez", undefined, undefined, undefined, "api-managed.json", undefined) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    var response_storage: [8192]u8 = undefined;

    // Unauthorized request
    const no_auth_req =
        "GET /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        "\r\n";
    const no_auth_resp = try testSendHttpRequestOnce(&server, 18081, no_auth_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, no_auth_resp, "401 Unauthorized") != null);

    // GET /api/quotes
    const get_all_req =
        "GET /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "\r\n";
    const get_all_resp = try testSendHttpRequestOnce(&server, 18081, get_all_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, get_all_resp, "200 OK") != null);
    const get_all_body = testResponseBody(get_all_resp);
    try std.testing.expect(std.mem.indexOf(u8, get_all_body, "\"count\":1") != null);
    try std.testing.expect(std.mem.indexOf(u8, get_all_body, "\"id\":0") != null);

    // POST empty text -> 400
    const post_empty_req =
        "POST /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "Content-Type: application/json\r\n" ++
        "Content-Length: 14\r\n" ++
        "\r\n" ++
        "{\"text\":\"\"}";
    const post_empty_resp = try testSendHttpRequestOnce(&server, 18081, post_empty_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, post_empty_resp, "400 Bad Request") != null);

    // POST duplicate -> 409
    const post_dup_req =
        "POST /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "Content-Type: application/json\r\n" ++
        "Content-Length: 24\r\n" ++
        "\r\n" ++
        "{\"text\":\"Initial quote\"}";
    const post_dup_resp = try testSendHttpRequestOnce(&server, 18081, post_dup_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, post_dup_resp, "409 Conflict") != null);

    // POST create -> 201
    const post_create_req =
        "POST /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "Content-Type: application/json\r\n" ++
        "Content-Length: 26\r\n" ++
        "\r\n" ++
        "{\"text\":\"Created via API\"}";
    const post_create_resp = try testSendHttpRequestOnce(&server, 18081, post_create_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, post_create_resp, "201 Created") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(post_create_resp), "\"id\":1") != null);

    // GET /api/quotes/1 -> 200
    const get_one_req =
        "GET /api/quotes/1 HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "\r\n";
    const get_one_resp = try testSendHttpRequestOnce(&server, 18081, get_one_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, get_one_resp, "200 OK") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(get_one_resp), "Created via API") != null);

    // PUT /api/quotes/1 -> 200
    const put_req =
        "PUT /api/quotes/1 HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "Content-Type: application/json\r\n" ++
        "Content-Length: 23\r\n" ++
        "\r\n" ++
        "{\"text\":\"Updated quote\"}";
    const put_resp = try testSendHttpRequestOnce(&server, 18081, put_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, put_resp, "200 OK") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(put_resp), "Updated quote") != null);

    // DELETE /api/quotes/1 -> 200
    const delete_req =
        "DELETE /api/quotes/1 HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "\r\n";
    const delete_resp = try testSendHttpRequestOnce(&server, 18081, delete_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, delete_resp, "200 OK") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(delete_resp), "\"status\":\"ok\"") != null);

    // GET deleted id -> 404
    const get_deleted_req =
        "GET /api/quotes/1 HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "\r\n";
    const get_deleted_resp = try testSendHttpRequestOnce(&server, 18081, get_deleted_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, get_deleted_resp, "404 Not Found") != null);
}

test "api_enabled=true allows API routes" {
    const allocator = std.testing.allocator;
    const auth_header = "Authorization: Basic YWRtaW46cXVvdGV6\r\n";

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();
    try store.add("Test quote");

    var config = config_mod.Configuration{
        .host = "127.0.0.1",
        .tcp_port = 8017,
        .udp_port = 8017,
        .health_enabled = true,
        .health_port = 8080,
        .directories = &.{},
        .selection_mode = .random,
        .polling_interval = 60,
        .api_enabled = true,
        .api_username = "admin",
        .api_password = "quotez",
        .api_quotes_path = "api-managed.json",
        .allocator = allocator,
    };

    var server = HttpServer.init(allocator, "127.0.0.1", 18082, &store, "admin", "quotez", undefined, undefined, undefined, "api-managed.json", &config) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    var response_storage: [8192]u8 = undefined;

    // GET /api/quotes should work
    const get_req =
        "GET /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "\r\n";
    const resp = try testSendHttpRequestOnce(&server, 18082, get_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, resp, "200 OK") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(resp), "Test quote") != null);
}

test "api_enabled=false blocks API routes but allows health endpoints" {
    const allocator = std.testing.allocator;
    const auth_header = "Authorization: Basic YWRtaW46cXVvdGV6\r\n";

    var store = quote_store.QuoteStore.init(allocator);
    defer store.deinit();
    try store.add("Test quote");

    var config = config_mod.Configuration{
        .host = "127.0.0.1",
        .tcp_port = 8017,
        .udp_port = 8017,
        .health_enabled = true,
        .health_port = 8080,
        .directories = &.{},
        .selection_mode = .random,
        .polling_interval = 60,
        .api_enabled = false,
        .api_username = "admin",
        .api_password = "quotez",
        .api_quotes_path = "api-managed.json",
        .allocator = allocator,
    };

    var server = HttpServer.init(allocator, "127.0.0.1", 18083, &store, "admin", "quotez", undefined, undefined, undefined, "api-managed.json", &config) catch |err| {
        if (err == error.AddressInUse) return error.SkipZigTest;
        return err;
    };
    defer server.deinit();

    var response_storage: [8192]u8 = undefined;

    // GET /health should still work
    const health_req =
        "GET /health HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        "\r\n";
    const health_resp = try testSendHttpRequestOnce(&server, 18083, health_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, health_resp, "200 OK") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(health_resp), "ok") != null);

    // GET /ready should still work
    const ready_req =
        "GET /ready HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        "\r\n";
    const ready_resp = try testSendHttpRequestOnce(&server, 18083, ready_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, ready_resp, "200 OK") != null);
    try std.testing.expect(std.mem.indexOf(u8, testResponseBody(ready_resp), "ready") != null);

    // GET /api/quotes should return 404
    const api_req =
        "GET /api/quotes HTTP/1.1\r\n" ++
        "Host: localhost\r\n" ++
        auth_header ++
        "\r\n";
    const api_resp = try testSendHttpRequestOnce(&server, 18083, api_req, &response_storage);
    try std.testing.expect(std.mem.indexOf(u8, api_resp, "404 Not Found") != null);
}
