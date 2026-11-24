//! Quote languages: BCP 47 language tags (it, it-IT, pt-BR, zh-Hant-TW),
//! language matching and the per-request locale choice.
//!
//! Matching rule: a request for `it-IT` is served only by a text written in
//! `it-IT` or, failing that, in plain `it`. A request for plain `it` accepts
//! `it` first and then any regional Italian variant. A quote with no text in
//! the requested language is never served in another language: callers must
//! exclude it.

const std = @import("std");

/// Longest canonical language tag we accept (e.g. "zh-Hant-TW" fits easily)
pub const max_tag_len = 35;

/// RFC 865: "the quote ... should be less than 512 characters".
/// Characters were ASCII bytes, so a text longer than this many UTF-8 bytes
/// is "web only": it is never selected over the QOTD protocol (TCP/UDP).
pub const qotd_max_bytes: usize = 511;

/// True when `text` fits the QOTD (RFC 865) size limit
pub fn fitsQotd(text: []const u8) bool {
    return text.len <= qotd_max_bytes;
}

/// Canonicalize a language tag into `out`: "IT_it" -> "it-IT", "zh-hant-tw" ->
/// "zh-Hant-TW". The primary subtag must be 2-3 ASCII letters; other subtags
/// are 1-8 alphanumerics. Returns null when `raw` is not a language tag.
pub fn canonicalize(raw: []const u8, out: *[max_tag_len]u8) ?[]const u8 {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    if (trimmed.len == 0 or trimmed.len > max_tag_len) return null;
    var it = std.mem.splitAny(u8, trimmed, "-_");
    var n: usize = 0;
    var index: usize = 0;
    while (it.next()) |sub| : (index += 1) {
        if (sub.len == 0 or sub.len > 8) return null;
        if (index == 0) {
            if (sub.len < 2 or sub.len > 3) return null;
            for (sub) |c| if (!std.ascii.isAlphabetic(c)) return null;
        } else {
            for (sub) |c| if (!std.ascii.isAlphanumeric(c)) return null;
            out[n] = '-';
            n += 1;
        }
        const all_alpha = for (sub) |c| {
            if (!std.ascii.isAlphabetic(c)) break false;
        } else true;
        for (sub, 0..) |c, i| {
            out[n + i] = if (index > 0 and sub.len == 2 and all_alpha)
                std.ascii.toUpper(c) // region: IT, BR
            else if (index > 0 and sub.len == 4 and all_alpha and i == 0)
                std.ascii.toUpper(c) // script: Hant
            else
                std.ascii.toLower(c);
        }
        n += sub.len;
    }
    return out[0..n];
}

/// ISO 639-1 two-letter language codes, used to tell "seneca.it.txt" (Italian)
/// from file names like "best.of.txt"
const iso639_1 = "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu";

/// True when `code` (2 letters, any case) is an ISO 639-1 language code
pub fn isIso639_1(code: []const u8) bool {
    if (code.len != 2) return false;
    var i: usize = 0;
    while (i + 2 <= iso639_1.len) : (i += 3) {
        if (std.ascii.eqlIgnoreCase(iso639_1[i .. i + 2], code)) return true;
    }
    return false;
}

/// Canonicalize and allocate a copy (null when `raw` is not a language tag)
pub fn dupeCanonical(allocator: std.mem.Allocator, raw: []const u8) !?[]const u8 {
    var buf: [max_tag_len]u8 = undefined;
    const tag = canonicalize(raw, &buf) orelse return null;
    return try allocator.dupe(u8, tag);
}

/// Primary language subtag: "it-IT" -> "it"
pub fn base(tag: []const u8) []const u8 {
    const dash = std.mem.indexOfScalar(u8, tag, '-') orelse return tag;
    return tag[0..dash];
}

/// How well a text written in `candidate` serves a request for `requested`
/// (both canonical). 0 means it must not be served.
pub fn matchScore(candidate: []const u8, requested: []const u8) u8 {
    if (std.ascii.eqlIgnoreCase(candidate, requested)) return 3;
    const req_base = base(requested);
    if (req_base.len != requested.len) {
        // Regional request (it-IT): only the plain language (it) may stand in
        return if (std.ascii.eqlIgnoreCase(candidate, req_base)) 2 else 0;
    }
    // Plain request (it): any regional variant of the language
    return if (std.ascii.eqlIgnoreCase(base(candidate), req_base)) 1 else 0;
}

/// True when `tag` is allowed by the `supported` list: an exact entry, or an
/// entry with the same primary language (it-IT is allowed by "it" and vice
/// versa). An empty list allows everything.
pub fn isSupported(supported: []const []const u8, tag: []const u8) bool {
    if (supported.len == 0) return true;
    for (supported) |s| {
        if (std.ascii.eqlIgnoreCase(base(s), base(tag))) return true;
    }
    return false;
}

/// Parsed QOTD request extension. RFC 865 ignores whatever the client sends,
/// so this is optional: an empty or unrecognized request gets the standard
/// single quote. Grammar (case-insensitive, whitespace separated):
///   [<locale>] [n <count>]      e.g. "it", "it-IT", "n 3", "fr n 2"
pub const QotdRequest = struct {
    locale_buf: [max_tag_len]u8 = undefined,
    locale_len: usize = 0,
    count: usize = 1,
    /// "help" or "?": describe the extension instead of sending a quote
    help: bool = false,

    /// Requested locale (canonical), null for a plain request
    pub fn locale(self: *const QotdRequest) ?[]const u8 {
        return if (self.locale_len == 0) null else self.locale_buf[0..self.locale_len];
    }
};

/// Maximum quotes in one QOTD reply with "n <count>"
pub const qotd_max_count: usize = 10;

pub fn parseQotdRequest(raw: []const u8) QotdRequest {
    var req: QotdRequest = .{};
    var tokens = std.mem.tokenizeAny(u8, raw, " \t\r\n");
    var expect_count = false;
    var index: usize = 0;
    while (tokens.next()) |tok| : (index += 1) {
        if (index == 0 and (std.ascii.eqlIgnoreCase(tok, "help") or std.mem.eql(u8, tok, "?"))) {
            if (tokens.next() != null) return .{};
            req.help = true;
            return req;
        }
        if (index > 3) return .{}; // not our grammar: standard reply
        if (expect_count) {
            const n = std.fmt.parseInt(usize, tok, 10) catch return .{};
            if (n == 0) return .{};
            req.count = @min(n, qotd_max_count);
            expect_count = false;
            continue;
        }
        if (std.ascii.eqlIgnoreCase(tok, "n")) {
            expect_count = true;
            continue;
        }
        if (index == 0) {
            if (canonicalize(tok, &req.locale_buf)) |tag| {
                req.locale_len = tag.len;
                continue;
            }
        }
        return .{};
    }
    if (expect_count) return .{};
    return req;
}

test "canonicalize" {
    var buf: [max_tag_len]u8 = undefined;
    try std.testing.expectEqualStrings("it", canonicalize("IT", &buf).?);
    try std.testing.expectEqualStrings("it-IT", canonicalize("it_it", &buf).?);
    try std.testing.expectEqualStrings("pt-BR", canonicalize(" pt-br ", &buf).?);
    try std.testing.expectEqualStrings("zh-Hant-TW", canonicalize("ZH-HANT-tw", &buf).?);
    try std.testing.expectEqualStrings("es-419", canonicalize("es-419", &buf).?);
    try std.testing.expect(canonicalize("", &buf) == null);
    try std.testing.expect(canonicalize("n", &buf) == null);
    try std.testing.expect(canonicalize("quote", &buf) == null);
    try std.testing.expect(canonicalize("it--IT", &buf) == null);
    try std.testing.expect(canonicalize("1t", &buf) == null);
}

test "matchScore never crosses languages" {
    try std.testing.expectEqual(@as(u8, 3), matchScore("it-IT", "it-IT"));
    try std.testing.expectEqual(@as(u8, 2), matchScore("it", "it-IT"));
    try std.testing.expectEqual(@as(u8, 0), matchScore("it-CH", "it-IT"));
    try std.testing.expectEqual(@as(u8, 0), matchScore("en", "it-IT"));
    try std.testing.expectEqual(@as(u8, 3), matchScore("it", "it"));
    try std.testing.expectEqual(@as(u8, 1), matchScore("it-CH", "it"));
    try std.testing.expectEqual(@as(u8, 0), matchScore("fr", "it"));
}

test "isSupported" {
    const list = [_][]const u8{ "en", "it", "fr" };
    try std.testing.expect(isSupported(&list, "it-IT"));
    try std.testing.expect(isSupported(&list, "fr"));
    try std.testing.expect(!isSupported(&list, "de"));
    try std.testing.expect(isSupported(&.{}, "de"));
}

test "parseQotdRequest" {
    var r = parseQotdRequest("");
    try std.testing.expect(r.locale() == null);
    try std.testing.expectEqual(@as(usize, 1), r.count);

    r = parseQotdRequest("it-it\r\n");
    try std.testing.expectEqualStrings("it-IT", r.locale().?);

    r = parseQotdRequest("fr n 3\n");
    try std.testing.expectEqualStrings("fr", r.locale().?);
    try std.testing.expectEqual(@as(usize, 3), r.count);

    r = parseQotdRequest("N 99");
    try std.testing.expect(r.locale() == null);
    try std.testing.expectEqual(qotd_max_count, r.count);

    // Anything else is a plain RFC 865 request
    r = parseQotdRequest("GET / HTTP/1.1");
    try std.testing.expect(r.locale() == null);
    try std.testing.expectEqual(@as(usize, 1), r.count);
    r = parseQotdRequest("it n");
    try std.testing.expect(r.locale() == null);

    try std.testing.expect(parseQotdRequest("HELP\r\n").help);
    try std.testing.expect(parseQotdRequest("?").help);
    try std.testing.expect(!parseQotdRequest("help me").help);
}
