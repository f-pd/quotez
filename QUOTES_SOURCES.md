# Quote sources and credits

Every quote in `quotes/` carries its original text in the language the author
actually wrote or spoke, and a `work` field with the precise source (work,
chapter or section, speech and date). Quotes with no verifiable source, and
apocryphal attributions, are not accepted.

## Where the texts were checked

Texts and references were checked against the primary works (most of them in
the public domain) and against [Wikiquote](https://www.wikiquote.org/) in
Italian, English, French, Spanish and German, whose content is available under
the [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
license. Wikiquote pages consulted include:

- it.wikiquote.org: Enrico Berlinguer, Piero Calamandrei, Lorenzo Milani
- en.wikiquote.org: Socialism, Eugene V. Debs
- fr.wikiquote.org: Aimé Césaire, Simone Weil
- es.wikiquote.org: Salvador Allende, Frida Kahlo
- de.wikiquote.org: Rosa Luxemburg, Bertolt Brecht (discussion)

Quotes from authors still under copyright are kept to short excerpts with
their source, as allowed by the right of quotation.

## Translations

Quotez never makes its own translations. Every translation comes from an
existing source (Wikiquote in the target language, Wikisource, or a published
translation with a named translator), recorded per quote in the
`translation_sources` field of the JSON files. When no existing translation is
found for a language, the quote has no version in that language and is not
served in that locale.

## Sources per language

The `work` field describes the source in each site language
(`{"en": ..., "it": ..., "fr": ...}`): titles stay in the original language
(ancient works use their conventional name in each language), while the
descriptive parts (chapter, preface, closing words, dates) are translated.

## Blocked authors

Fascists, Nazis and the contemporary far right are never quoted. The list is
compiled into the service (`src/blocklist.zig`): blocked quotes are skipped
when files are loaded and rejected by the backoffice API.
