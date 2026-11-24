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

The English translation of the *Manifesto of the Communist Party* is Samuel
Moore's (1888, public domain), as noted in the `work` field. Every other
translation into English, Italian and French is an original translation made
for Quotez, kept as close to the original as possible.

## Blocked authors

Fascists, Nazis and the contemporary far right are never quoted. The list is
compiled into the service (`src/blocklist.zig`): blocked quotes are skipped
when files are loaded and rejected by the backoffice API.
