//! Author blocklist: fascists, Nazis and the contemporary far right never get
//! a quote in Quotez. The list is compiled into the binary on purpose, so it
//! cannot be switched off from a config file or the backoffice.
//!
//! A quote is blocked when its author (the "author" field, or the attribution
//! after the last " - " in the text or in any translation) names a blocked
//! person. Matching is on whole words after lowercasing and folding accents,
//! so "Adolf Hitler", "A. HITLER" and "Hermann Göring" are caught while
//! "Franco Basaglia" or "Moses Hess" are not (ambiguous surnames are listed
//! only together with the first name).
//!
//! Checked when quote files are loaded (blocked quotes are skipped) and when
//! the backoffice creates or edits a quote through the API (rejected).

const std = @import("std");

/// Blocked names, already normalized: lowercase ASCII words separated by one
/// space. A one-word entry is used only for surnames that are unambiguous.
pub const blocked_names = [_][]const u8{
    // Nazism
    "hitler",
    "goebbels",
    "himmler",
    "goring",
    "goering",
    "heydrich",
    "eichmann",
    "mengele",
    "rudolf hess",
    "martin bormann",
    "alfred rosenberg",
    "julius streicher",
    "albert speer",
    "carl schmitt",
    // Italian fascism and neo-fascism
    "mussolini",
    "giovanni gentile",
    "roberto farinacci",
    "achille starace",
    "rodolfo graziani",
    "italo balbo",
    "galeazzo ciano",
    "filippo tommaso marinetti",
    "julius evola",
    "evola",
    "giorgio almirante",
    "pino rauti",
    "junio valerio borghese",
    "ezra pound",
    // Other fascist and collaborationist regimes and ideologues
    "francisco franco",
    "primo de rivera",
    "pinochet",
    "videla",
    "stroessner",
    "rios montt",
    "antonio salazar",
    "oliveira salazar",
    "petain",
    "pierre laval",
    "charles maurras",
    "robert brasillach",
    "drieu la rochelle",
    "louis ferdinand celine",
    "quisling",
    "ante pavelic",
    "ion antonescu",
    "codreanu",
    "miklos horthy",
    "ferenc szalasi",
    "oswald mosley",
    "leon degrelle",
    "knut hamsun",
    "hideki tojo",
    // Contemporary far right
    "trump",
    "elon musk",
    "musk",
    "jd vance",
    "j d vance",
    "steve bannon",
    "stephen bannon",
    "bannon",
    "bolsonaro",
    "viktor orban",
    "javier milei",
    "milei",
    "marine le pen",
    "jean marie le pen",
    "jordan bardella",
    "zemmour",
    "giorgia meloni",
    "matteo salvini",
    "roberto vannacci",
    "geert wilders",
    "alice weidel",
    "bjorn hocke",
    "santiago abascal",
    "nick fuentes",
    "andrew tate",
    "tucker carlson",
    "charlie kirk",
    "nigel farage",
    "marjorie taylor greene",
    "rodrigo duterte",
    "anders breivik",
    "breivik",
    "brenton tarrant",
};

/// Longest author/attribution looked at; longer tails are not names
const max_name_len = 160;

/// Lowercase ASCII for a 2-byte UTF-8 Latin letter, 0 when not foldable
fn foldLatin(b0: u8, b1: u8) u8 {
    if (b0 == 0xC3) {
        if (b1 < 0x80 or b1 > 0xBF) return 0;
        const cp: u8 = b1 + 0x40; // U+00C0..U+00FF
        return switch (cp) {
            0xC0...0xC5, 0xE0...0xE5 => 'a',
            0xC7, 0xE7 => 'c',
            0xC8...0xCB, 0xE8...0xEB => 'e',
            0xCC...0xCF, 0xEC...0xEF => 'i',
            0xD1, 0xF1 => 'n',
            0xD2...0xD6, 0xD8, 0xF2...0xF6, 0xF8 => 'o',
            0xD9...0xDC, 0xF9...0xFC => 'u',
            0xDD, 0xFD, 0xFF => 'y',
            0xDF => 's',
            else => 0,
        };
    }
    if (b0 == 0xC4) {
        // U+0100..U+013F
        if (b1 < 0x80 or b1 > 0xBF) return 0;
        const cp: u16 = 0x100 + @as(u16, b1 - 0x80);
        return switch (cp) {
            0x100...0x105 => 'a',
            0x106...0x10D => 'c',
            0x10E...0x111 => 'd',
            0x112...0x11B => 'e',
            0x11C...0x123 => 'g',
            0x128...0x131 => 'i',
            0x139...0x13E => 'l',
            else => 0,
        };
    }
    if (b0 == 0xC5) {
        // U+0140..U+017F
        if (b1 < 0x80 or b1 > 0xBF) return 0;
        const cp: u16 = 0x140 + @as(u16, b1 - 0x80);
        return switch (cp) {
            0x141, 0x142 => 'l',
            0x143...0x148 => 'n',
            0x14C...0x151 => 'o',
            0x154...0x159 => 'r',
            0x15A...0x161 => 's',
            0x162...0x165 => 't',
            0x168...0x173 => 'u',
            0x179...0x17E => 'z',
            else => 0,
        };
    }
    return 0;
}

/// Normalize a name into `out` as " word word " (leading and trailing space,
/// lowercase ASCII words, accents folded, everything else a separator).
fn normalize(name: []const u8, out: *[max_name_len * 2 + 2]u8) []const u8 {
    var n: usize = 0;
    out[n] = ' ';
    n += 1;
    var i: usize = 0;
    while (i < name.len and n + 2 < out.len) {
        const b = name[i];
        if (b < 0x80) {
            if (std.ascii.isAlphanumeric(b)) {
                out[n] = std.ascii.toLower(b);
                n += 1;
            } else if (out[n - 1] != ' ') {
                out[n] = ' ';
                n += 1;
            }
            i += 1;
        } else if (i + 1 < name.len and b >= 0xC0 and b < 0xE0 and foldLatin(b, name[i + 1]) != 0) {
            out[n] = foldLatin(b, name[i + 1]);
            n += 1;
            i += 2;
        } else {
            // Other scripts: keep the bytes as part of the word
            out[n] = b;
            n += 1;
            i += 1;
        }
    }
    if (out[n - 1] != ' ') {
        out[n] = ' ';
        n += 1;
    }
    return out[0..n];
}

/// The blocked name `name` refers to, if any
pub fn blockedName(name: []const u8) ?[]const u8 {
    const trimmed = std.mem.trim(u8, name, " \t\r\n");
    if (trimmed.len == 0) return null;
    var buf: [max_name_len * 2 + 2]u8 = undefined;
    const norm = normalize(trimmed[0..@min(trimmed.len, max_name_len)], &buf);
    for (blocked_names) |entry| {
        var pat_buf: [64]u8 = undefined;
        const pat = std.fmt.bufPrint(&pat_buf, " {s} ", .{entry}) catch continue;
        if (std.mem.indexOf(u8, norm, pat) != null) return entry;
    }
    return null;
}

/// The attribution at the end of a quote text ("... - Author"), if any
pub fn attribution(text: []const u8) ?[]const u8 {
    const seps = [_][]const u8{ " - ", " — ", " – ", " ― " };
    var best: ?usize = null;
    var best_len: usize = 0;
    for (seps) |sep| {
        if (std.mem.lastIndexOf(u8, text, sep)) |pos| {
            if (best == null or pos > best.?) {
                best = pos;
                best_len = sep.len;
            }
        }
    }
    const pos = best orelse return null;
    const tail = std.mem.trim(u8, text[pos + best_len ..], " \t\r\n");
    if (tail.len == 0 or tail.len > max_name_len) return null;
    return tail;
}

/// The blocked name a quote is attributed to, checking the author field and
/// the attribution of the text and of every translation
pub fn blockedQuote(author: ?[]const u8, text: []const u8, translations: anytype) ?[]const u8 {
    if (author) |a| {
        if (blockedName(a)) |b| return b;
    }
    if (attribution(text)) |a| {
        if (blockedName(a)) |b| return b;
    }
    for (translations) |tr| {
        if (attribution(tr.text)) |a| {
            if (blockedName(a)) |b| return b;
        }
    }
    return null;
}

test "blocklist - full names, surnames, case and accents" {
    try std.testing.expect(blockedName("Adolf Hitler") != null);
    try std.testing.expect(blockedName("A. HITLER") != null);
    try std.testing.expect(blockedName("Hermann Göring") != null);
    try std.testing.expect(blockedName("Benito Mussolini") != null);
    try std.testing.expect(blockedName("Donald J. Trump") != null);
    try std.testing.expect(blockedName("Elon Musk") != null);
    try std.testing.expect(blockedName("Philippe Pétain") != null);
    try std.testing.expect(blockedName("Francisco Franco Bahamonde") != null);
    try std.testing.expect(blockedName("Björn Höcke") != null);
    try std.testing.expect(blockedName("Ante Pavelić") != null);
}

test "blocklist - no false positives on similar names" {
    try std.testing.expect(blockedName("Franco Basaglia") == null);
    try std.testing.expect(blockedName("Franco Fortini") == null);
    try std.testing.expect(blockedName("Moses Hess") == null);
    try std.testing.expect(blockedName("Antonio Gramsci") == null);
    try std.testing.expect(blockedName("Trumpeter Swan") == null);
    try std.testing.expect(blockedName("Karl Marx") == null);
    try std.testing.expect(blockedName("") == null);
}

test "blocklist - attribution in text and translations" {
    const T = struct { lang: []const u8, text: []const u8 };
    const none = [_]T{};
    try std.testing.expect(blockedQuote(null, "Something. - Adolf Hitler", &none) != null);
    try std.testing.expect(blockedQuote(null, "Qualcosa — Benito Mussolini", &none) != null);
    try std.testing.expect(blockedQuote("Elon Musk", "Anything", &none) != null);
    const trs = [_]T{.{ .lang = "en", .text = "Text - Donald Trump" }};
    try std.testing.expect(blockedQuote(null, "Testo originale", &trs) != null);
    try std.testing.expect(blockedQuote(null, "Odio gli indifferenti. - Antonio Gramsci", &none) == null);
    try std.testing.expect(attribution("No dash here") == null);
}
