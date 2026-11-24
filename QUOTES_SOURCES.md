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

## Translation credits

Generated from the `translation_sources` field of each quote file.

### default

- ὁ δὲ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ. - Σωκράτης
  - it: Emidio Martini, Platone, Apologia di Socrate, Paravia 1934, cap. XXVIII, p. 48 (via Wikiquote it) — https://it.wikiquote.org/wiki/Platone#Apologia_di_Socrate
  - en: Wikiquote (en), page Apology (Plato), 38a (main rendering, no translator named; variants by G. M. A. Grube, W. H. D. Rouse, Jowett on same page) — https://en.wikiquote.org/wiki/Apology_(Plato)
  - fr: Victor Cousin, Œuvres de Platon, Rey et Gravier 1846, tome I (Wikisource fr) — https://fr.wikisource.org/wiki/Apologie_de_Socrate_(trad._Cousin)/Dialogue
- ἡ δ᾽ ἀρχὴ λέγεται ἥμισυ εἶναι παντός. - Ἀριστοτέλης
  - en: Wikiquote (en), page Politics (Aristotle), Book V, 1303b.19-30 (no translator named for this entry; Jowett's wording) — https://en.wikiquote.org/wiki/Politics_(Aristotle)
  - fr: Jules Barthélemy-Saint-Hilaire, Aristote, La Politique, Ladrange 1874, livre VIII (= Bekker V), ch. III, § 2 (Wikisource fr) — https://fr.wikisource.org/wiki/La_Politique/Livre_VIII
  - it: Bernardo Segni (XVI sec.), Aristotele, Trattato dei governi (Politica), libro ottavo, cap. IV (Wikisource it) — https://it.wikisource.org/wiki/Trattato_dei_governi/Libro_ottavo/IV
- Πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει. - Ἀριστοτέλης
  - it: Wikiquote (it), page Aristotele, Metafisica I, 1, 980a 21; page bibliography: Aristotele. Volume primo (Dell'anima, Metafisica), trad. Renato Laurenti, Antonio Russo, Mondadori 2008 — https://it.wikiquote.org/wiki/Aristotele#Metafisica
  - en: W. D. Ross, Metaphysics (1908), Book I, 980a21 (via Wikiquote en, linking en.wikisource Metaphysics (Ross, 1908)) — https://en.wikiquote.org/wiki/Aristotle#Metaphysics
  - fr: Victor Cousin, De la Métaphysique d’Aristote, Ladrange 1838, livre I, ch. 1 (Wikisource fr) — https://fr.wikisource.org/wiki/Premier_livre_de_la_M%C3%A9taphysique_(trad._Cousin)
- Μηκέτι ὅλως περὶ τοῦ οἷόν τινα εἶναι τὸν ἀγαθὸν ἄνδρα διαλέγεσθαι, ἀλλ…
  - en: C. R. Haines, Meditations, Loeb Classical Library 1916, X.16 (via Wikiquote en) — https://en.wikiquote.org/wiki/Marcus_Aurelius
  - fr: Jules Barthélemy-Saint-Hilaire, Pensées pour moi-même, Germer-Baillière 1876, X, 16 (Wikisource fr) — https://fr.wikisource.org/wiki/Pens%C3%A9es_pour_moi-m%C3%AAme/Livre_X
  - it: Umberto Moricca, Marco Aurelio, I Ricordi, Chiantore, Torino 1923, X, 16 (Wikisource it) — https://it.wikisource.org/wiki/I_Ricordi/Libro_X
- Ὁποῖα ἂν πολλάκις φαντασθῇς, τοιαύτη σοι ἔσται ἡ διάνοια· βάπτεται γὰρ…
  - en: Gregory Hays, Meditations (Modern Library 2002), V, 16 (via Wikiquote en) — https://en.wikiquote.org/wiki/Marcus_Aurelius
  - fr: Jules Barthélemy-Saint-Hilaire, Pensées pour moi-même, Germer-Baillière 1876, V, 16 (Wikisource fr) — https://fr.wikisource.org/wiki/Pens%C3%A9es_pour_moi-m%C3%AAme/Livre_V
  - it: Umberto Moricca, Marco Aurelio, I Ricordi, Chiantore, Torino 1923, V, 16 (Wikisource it) — https://it.wikisource.org/wiki/I_Ricordi/Libro_V
- Non exiguum temporis habemus, sed multum perdidimus. - Seneca
  - it: Alfonso Traina, La brevità della vita, BUR 1993, p. 41 (via Wikiquote it) — https://it.wikiquote.org/wiki/Lucio_Anneo_Seneca#De_brevitate_vitae
  - en: John W. Basore, On the Shortness of Life, ch. 1 (via Wikiquote en) — https://en.wikiquote.org/wiki/Seneca_the_Younger
  - fr: Joseph Baillard, Œuvres complètes de Sénèque le Philosophe (Hachette), De la brièveté de la vie, ch. 1 (Wikisource fr) — https://fr.wikisource.org/wiki/De_la_bri%C3%A8vet%C3%A9_de_la_vie/Traduction_Baillard
- Omnia, Lucili, aliena sunt, tempus tantum nostrum est. - Seneca
  - en: Richard Mott Gummere, Moral Letters to Lucilius, Loeb 1917, Letter 1, §3 (Wikisource en) — https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_1
  - fr: Joseph Baillard, Sénèque, Œuvres complètes, tome II (Hachette), Lettre 1 (Wikisource fr) — https://fr.wikisource.org/wiki/Lettres_%C3%A0_Lucilius/Lettre_1
- Ποταμῷ γὰρ οὐκ ἔστιν ἐμβῆναι δὶς τῷ αὐτῷ. - Ἡράκλειτος
  - it: Wikiquote (it), page Eraclito, fr. 91a (page bibliography: Francesco Fronterotta, Frammenti, BUR 2013 / Angelo Tonelli, Feltrinelli 1993) — https://it.wikiquote.org/wiki/Eraclito#Sulla_natura
  - en: Wikiquote (en), page Heraclitus, Fragment 91 (Plutarch, On the EI at Delphi); no translator named — https://en.wikiquote.org/wiki/Heraclitus
  - fr: Abel Jeannière, Héraclite. Traduction et Commentaire des Fragments, Aubier Montaigne 1985, p. 116 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/H%C3%A9raclite_d%27%C3%89ph%C3%A8se
- 千里之行，始於足下。 - 老子
  - it: Girolamo Mancuso, Il libro del Tao, Newton 1995, cap. 64 (via Wikiquote it) — https://it.wikiquote.org/wiki/Laozi
  - en: Wikiquote (en), page Laozi, chapter 64; no translator named — https://en.wikiquote.org/wiki/Laozi
  - fr: Stanislas Julien, Le Livre de la Voie et de la Vertu (Tao Te King), 1842, ch. 64 (Wikisource fr) — https://fr.wikisource.org/wiki/Tao_Te_King_(Stanislas_Julien,_sans_notes)
- La sapienza è figliola della sperienza. - Leonardo da Vinci
  - fr: Louise Servicen (texte établi par Edward MacCurdy), Léonard de Vinci, Carnets, Gallimard 2019, p. 132 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/L%C3%A9onard_de_Vinci
  - en: Jean Paul Richter, The Notebooks of Leonardo da Vinci (1883), XIX Philosophical Maxims (via Wikiquote en) — https://en.wikiquote.org/wiki/Leonardo_da_Vinci
- Nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura.…
  - en: Henry Wadsworth Longfellow, Inferno I, 1-2 (via Wikiquote en) — https://en.wikiquote.org/wiki/Divine_Comedy
  - fr: Jacqueline Risset, La Divine Comédie : L'Enfer, GF-Flammarion 1992, chant I, v. 1-2 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Dante_Alighieri
- Je pense, donc je suis. - René Descartes
  - en: Wikiquote (en), page René Descartes, Discourse on the Method; no translator named — https://en.wikiquote.org/wiki/Ren%C3%A9_Descartes
  - it: Adolfo Levi, Cartesio, Discorso sul metodo, Loffredo, Napoli 1937, parte IV, p. 57 (via Wikiquote it) — https://it.wikiquote.org/wiki/Cartesio#Discorso_sul_metodo
- Imagination is more important than knowledge. - Albert Einstein
  - fr: Wikiquote (fr), page Albert Einstein (no translator named; source cited: Viereck, Saturday Evening Post, 26 Oct 1929, p. 17) — https://fr.wikiquote.org/wiki/Albert_Einstein
  - it: Wikiquote (it), page Albert Einstein (no translator named) — https://it.wikiquote.org/wiki/Albert_Einstein
- This above all: to thine own self be true. - William Shakespeare
  - fr: François-Victor Hugo, Shakespeare, Œuvres complètes, Pagnerre 1865, tome I, Hamlet I, 3 (Wikisource fr) — https://fr.wikisource.org/wiki/Le_second_Hamlet_(trad._Hugo)
  - it: Carlo Rusconi, Teatro completo di Shakspeare, UTET, Torino 1858, Amleto I, 3 (Wikisource it) — https://it.wikisource.org/wiki/Amleto/Atto_primo

### marxism

- Die Geschichte aller bisherigen Gesellschaft ist die Geschichte von Kl…
  - en: Wikiquote (en), page The Communist Manifesto; tr. Samuel Moore (1888), Section I — https://en.wikiquote.org/wiki/The_Communist_Manifesto
  - it: Wikiquote (it), page Manifesto del Partito Comunista; tr. Pietro Gori (Flaminio Fantuzzi, Milano, 1891), also on it.wikisource — https://it.wikiquote.org/wiki/Manifesto_del_Partito_Comunista
  - fr: Wikiquote (fr), page Karl Marx; tr. Laura Lafargue, Manifeste du Parti communiste, Champ libre, 1983, p. 28 — https://fr.wikiquote.org/wiki/Karl_Marx
- Die Proletarier haben nichts in ihr zu verlieren als ihre Ketten. Sie…
  - en: Wikiquote (en), page The Communist Manifesto; tr. Samuel Moore (1888), Section IV, last paragraph — https://en.wikiquote.org/wiki/The_Communist_Manifesto
  - it: Wikiquote (it), page Manifesto del Partito Comunista; tr. Pietro Gori (1891) — https://it.wikiquote.org/wiki/Manifesto_del_Partito_Comunista
  - fr: Wikiquote (fr), page Karl Marx; tr. Émile Bottigelli, Manifeste du Parti communiste, Flammarion GF, 1998, p. 119 — https://fr.wikiquote.org/wiki/Karl_Marx
- Die Philosophen haben die Welt nur verschieden interpretiert, es kommt…
  - en: Wikiquote (en), page Karl Marx; Theses on Feuerbach, Thesis 11, Marx Engels Selected Works vol. I, p. 15 — https://en.wikiquote.org/wiki/Karl_Marx
  - it: Wikiquote (it), page Karl Marx; tr. Palmiro Togliatti, appendix to Engels, Ludwig Feuerbach..., Editori Riuniti, 1950 (also marxists.org/italiano/marx-engels/1845/3/tesi-f.htm) — https://it.wikiquote.org/wiki/Karl_Marx
  - fr: Wikiquote (fr), page Karl Marx; tr. Maximilien Rubel, Œuvres III (Philosophie), Gallimard, Pléiade, 1982, p. 1033 — https://fr.wikiquote.org/wiki/Karl_Marx
- Die Religion ist der Seufzer der bedrängten Kreatur, das Gemüt einer h…
  - en: Wikiquote (en), page Karl Marx; A Contribution to the Critique of Hegel's Philosophy of Right, Introduction — https://en.wikiquote.org/wiki/Karl_Marx
  - it: Wikiquote (it), page Karl Marx; text as on marxists.org/italiano/marx-engels/1844/2/criticahegel.htm — https://it.wikiquote.org/wiki/Karl_Marx
  - fr: Wikiquote (fr), page Karl Marx; tr. Jules Molitor, in Marx, Œuvres III (Philosophie), Gallimard, Pléiade, 1982, p. 383 — https://fr.wikiquote.org/wiki/Karl_Marx
- Die Menschen machen ihre eigene Geschichte, aber sie machen sie nicht…
  - en: Marxists Internet Archive, The Eighteenth Brumaire of Louis Bonaparte, ch. I (same text on Wikiquote (en), page Karl Marx) — https://www.marxists.org/archive/marx/works/1852/18th-brumaire/ch01.htm
  - it: Wikiquote (it), page Karl Marx; tr. Palmiro Togliatti, Il 18 brumaio di Luigi Bonaparte, Editori Riuniti (also marxists.org/italiano/marx-engels/1852/brumaio/cap1.htm) — https://it.wikiquote.org/wiki/Karl_Marx
  - fr: Marxists Internet Archive (français), Le 18 brumaire de L. Bonaparte, ch. I (Éditions sociales text) — https://www.marxists.org/francais/marx/works/1851/12/brum3.htm
- Hegel bemerkte irgendwo, daß alle großen weltgeschichtlichen Tatsachen…
  - en: Marxists Internet Archive, The Eighteenth Brumaire of Louis Bonaparte, ch. I — https://www.marxists.org/archive/marx/works/1852/18th-brumaire/ch01.htm
  - it: Wikiquote (it), page Karl Marx; tr. Palmiro Togliatti, Il 18 brumaio di Luigi Bonaparte, Editori Riuniti, 2001, p. 45 — https://it.wikiquote.org/wiki/Karl_Marx
  - fr: Wikiquote (fr), page Karl Marx; tr. Léon Rémy et Jules Molitor, Le 18 brumaire de Louis Bonaparte, La Table Ronde, 2001 — https://fr.wikiquote.org/wiki/Karl_Marx
- Jeder nach seinen Fähigkeiten, jedem nach seinen Bedürfnissen! - Karl…
  - en: Wikiquote (en), page Karl Marx; Critique of the Gotha Program (1875) — https://en.wikiquote.org/wiki/Karl_Marx
  - it: Wikiquote (it), page Karl Marx, section Critica al programma di Gotha (no translator named) — https://it.wikiquote.org/wiki/Karl_Marx
  - fr: Marxists Internet Archive (français), Critique du programme de Gotha (Éditions sociales) — https://marxists.org/francais/marx/works/1875/05/GOTHA.pdf
- Es ist nicht das Bewußtsein der Menschen, das ihr Sein, sondern umgeke…
  - en: Wikiquote (en), page Karl Marx; Preface to A Contribution to the Critique of Political Economy (1859) — https://en.wikiquote.org/wiki/Karl_Marx
  - it: Marxists Internet Archive (italiano), Per la critica dell'economia politica, Prefazione (Editori Riuniti edition) — https://www.marxists.org/italiano/marx-engels/1859/criticaep/prefazione.htm
  - fr: Wikiquote (fr), page Karl Marx; tr. Maximilien Rubel et Louis Evrard, Critique de l'Économie politique, Avant-propos, Gallimard, Pléiade, 1965, p. 272 — https://fr.wikiquote.org/wiki/Karl_Marx
- Das Kapital ist verstorbne Arbeit, die sich nur vampyrmäßig belebt dur…
  - en: Wikiquote (en), page Karl Marx; Capital vol. I, ch. 10, section 1, p. 257 — https://en.wikiquote.org/wiki/Karl_Marx
  - it: tr. Delio Cantimori, Il Capitale, Libro I, Editori Riuniti (wording as quoted by pcint.org and many other sources; attributed to Cantimori ed. by lacittafutura.it) — http://pcint.org/02_IlC/156/156_disastri-idrogeologici.htm
  - fr: Wikiquote (fr), page Karl Marx; Le Capital, livre I, PUF (tr. under Jean-Pierre Lefebvre), ch. VIII, p. 259 — https://fr.wikiquote.org/wiki/Karl_Marx
- Без революционной теории не может быть и революционного движения. - Вл…
  - en: Marxists Internet Archive, Lenin, What Is to Be Done?, ch. I, D (Lenin Collected Works, Progress Publishers) — https://www.marxists.org/archive/lenin/works/1901/witbd/i.htm
  - it: Wikiquote (it), page Lenin (cited from dizionari.corriere.it) — https://it.wikiquote.org/wiki/Lenin
  - fr: Marxists Internet Archive (français), Lénine, Que faire ?, I.d (Éditions sociales; Politzer cites Éditions sociales 1947, p. 26) — https://www.marxists.org/francais/lenin/works/1902/02/19020200e.htm
- Freiheit ist immer Freiheit der Andersdenkenden. - Rosa Luxemburg
  - en: Wikiquote (en), page Rosa Luxemburg; Die russische Revolution (1920), p. 109 / Gesammelte Werke vol. 4, p. 359, note 3 — https://en.wikiquote.org/wiki/Rosa_Luxemburg
  - it: Wikiquote (it), page Rosa Luxemburg; La rivoluzione russa, in Scritti politici, ed. Lelio Basso, Editori Riuniti, 1970, p. 589 — https://it.wikiquote.org/wiki/Rosa_Luxemburg
  - fr: Wikiquote (fr), page Rosa Luxemburg; tr. Gilbert Badia, Lettres et textes choisis, Le Temps des Cerises, 2006, p. 98 — https://fr.wikiquote.org/wiki/Rosa_Luxemburg
- Die Revolution wird sich morgen schon »rasselnd wieder in die Höh' ric…
  - en: Wikiquote (en), page Rosa Luxemburg; "Order reigns in Berlin", Collected Works 4 — https://en.wikiquote.org/wiki/Rosa_Luxemburg
  - it: Wikiquote (it), page Rosa Luxemburg; as quoted in Peter J. Nettl, Rosa Luxemburg, Il Saggiatore, 1970, II, p. 342 — https://it.wikiquote.org/wiki/Rosa_Luxemburg
- So ist das Leben und so muss man es nehmen, tapfer, unverzagt und läch…
  - en: The Letters of Rosa Luxemburg, Verso, 2011 (tr. George Shriver), letter to Sophie Liebknecht, Breslau, before 24 December 1917; bracketed insertion is the translator's — https://versobooks.com/blogs/news/1910-rosa-luxemburg-a-letter-from-her-prison-cell
- Odio gli indifferenti. Credo come Federico Hebbel che «vivere vuol dir…
  - en: tr. Giovanni Tiso, Overland literary journal, 18 March 2013 (spelling 'Frederich' as in source) — https://overland.org.au/2013/03/i-hate-the-indifferent
  - fr: Wikiquote (fr), page Antonio Gramsci; tr. Martin Rueff, Pourquoi je hais l'indifférence, Payot et Rivages, 2012, p. 55 — https://fr.wikiquote.org/wiki/Antonio_Gramsci
- Istruitevi, perché avremo bisogno di tutta la nostra intelligenza. Agi…
  - en: Workers of the World (journal), 2023, quoting L'Ordine Nuovo, I, 1, 1 May 1919 — https://workersoftheworld.net/wp-content/uploads/2023/08/WoW_02_09.pdf
- La crisi consiste appunto nel fatto che il vecchio muore e il nuovo no…
  - en: Wikiquote (en), page Antonio Gramsci; Selections from the Prison Notebooks, International Publishers, 1971, pp. 275-276 (tr. Quintin Hoare and Geoffrey Nowell Smith) — https://en.wikiquote.org/wiki/Antonio_Gramsci
  - fr: Wikiquote (fr), page Antonio Gramsci; tr. Monique Aymard et Françoise Bouillot, Cahiers de prison I, Gallimard, 1983, p. 283 — https://fr.wikiquote.org/wiki/Antonio_Gramsci
- Es ist niemals ein Dokument der Kultur, ohne zugleich ein solches der…
  - en: Wikiquote (en), page Walter Benjamin; Theses on the Philosophy of History, VII (tr. Harry Zohn, Illuminations) — https://en.wikiquote.org/wiki/Walter_Benjamin
  - it: tr. Renato Solmi, Tesi di filosofia della storia, in Angelus Novus. Saggi e frammenti, Einaudi, 1962 (as reproduced by peacelink.it, 1981 edition) — https://liste.peacelink.it/nonviolenza/2026/10/msg00007.html
  - fr: tr. Michael Löwy (Avertissement d'incendie, Éditions de l'Éclat, 2014), based on Maurice de Gandillac's translation; thesis VII — https://fr.anarchistlibraries.net/library/walter-benjamin-theses-sur-le-concept-d-histoire
- Die Tradition der Unterdrückten belehrt uns darüber, daß der »Ausnahme…
  - en: Wikiquote (en), page Walter Benjamin; Theses on the Philosophy of History, VIII (tr. Harry Zohn) — https://en.wikiquote.org/wiki/Walter_Benjamin
  - it: tr. Renato Solmi, Angelus Novus, Einaudi, 1962 — https://liste.peacelink.it/nonviolenza/2026/10/msg00007.html
  - fr: tr. Michael Löwy (2014), based on Maurice de Gandillac; thesis VIII — https://fr.anarchistlibraries.net/library/walter-benjamin-theses-sur-le-concept-d-histoire
- The economic anarchy of capitalist society as it exists today is, in m…
  - fr: Marxists Internet Archive (français), Einstein, Pourquoi le socialisme ? (1949); same text in Contretemps, 2015 — https://www.marxists.org/francais/general/einstein/1949/00/einstein.htm
- Déjeme decirle, a riesgo de parecer ridículo, que el verdadero revoluc…
  - en: Wikiquote (en), page Che Guevara; Socialism and Man in Cuba (1965) — https://en.wikiquote.org/wiki/Che_Guevara
  - it: Wikiquote (it), page Che Guevara; from Scritti, discorsi e diari di guerriglia, 1959-1967 — https://it.wikiquote.org/wiki/Che_Guevara
- Tienen la fuerza, podrán avasallarnos, pero no se detienen los proceso…
  - en: Wikiquote (en), page Salvador Allende; last speech, 11 September 1973 — https://en.wikiquote.org/wiki/Salvador_Allende
  - it: Wikiquote (it), page Salvador Allende, section Ultimo discorso (two consecutive entries joined; no translator named) — https://it.wikiquote.org/wiki/Salvador_Allende
  - fr: Le Monde diplomatique, Manière de voir no. 118 (2011), extract from Salvador Allende, Contre la tyrannie, Seuil, Paris, 2010 — https://www.monde-diplomatique.fr/mav/118/A/47131
- Sigan ustedes sabiendo que, mucho más temprano que tarde, de nuevo se…
  - en: Wikiquote (en), page Salvador Allende; last speech, 11 September 1973 — https://en.wikiquote.org/wiki/Salvador_Allende
  - it: Wikiquote (it), page Salvador Allende, section Ultimo discorso (no translator named) — https://it.wikiquote.org/wiki/Salvador_Allende
  - fr: Le Monde diplomatique, Manière de voir no. 118 (2011), extract from Salvador Allende, Contre la tyrannie, Seuil, 2010 — https://www.monde-diplomatique.fr/mav/118/A/47131
- Không có gì quý hơn độc lập, tự do. - Hồ Chí Minh
  - it: Wikiquote (it), page Ho Chi Minh; as quoted in 'Il messaggio di Ho Chi Minh', La Stampa, 25 May 1968 — https://it.wikiquote.org/wiki/Ho_Chi_Minh
  - en: Wikiquote (en), page Ho Chí Minh — https://en.wikiquote.org/wiki/Ho_Ch%C3%AD_Minh
  - fr: Hô Chi Minh, Écrits et combats (Prefasse), heading of the appeal of 17 July 1966; same wording in UN document A/34/553 (French) — https://www.prefasse.org/ho-chi-minh-ecrits-et-combats/
- 其實地上本沒有路，走的人多了，也便成了路。 - 魯迅
  - en: tr. Yang Hsien-yi and Gladys Yang, Selected Stories of Lu Hsun, Foreign Languages Press, Peking (Marxists Internet Archive) — https://www.marxists.org/archive/lu-xun/1921/01/x01.htm

### anarchism

- La propriété, c'est le vol ! - Pierre-Joseph Proudhon
  - it: Wikiquote (it), page Pierre-Joseph Proudhon, section 'Che cos'è la proprietà?' — https://it.wikiquote.org/wiki/Pierre-Joseph_Proudhon
  - en: What is Property?, trans. Benjamin R. Tucker (1890), ch. I (via Wikiquote en) — https://en.wikiquote.org/wiki/Pierre-Joseph_Proudhon
- Si Dieu est, l'homme est esclave ; or l'homme peut, doit être libre, d…
  - it: Wikiquote (it), page Michail Bakunin, section 'Dio e lo Stato' (bibliography lists translations by Giuseppe Rose, RL 1974, and Paolina Bissolati, 1949; quote not tied to one) — https://it.wikiquote.org/wiki/Michail_Bakunin
  - en: God and the State, trans. Benjamin R. Tucker (1883), ch. II (marxists.org) — https://www.marxists.org/reference/archive/bakunin/works/godstate/ch02.htm
- "Don't compete! — competition is always injurious to the species, and…
  - fr: L'Entr'aide, un facteur de l'évolution, trad. Louise Guieysse-Bréal, Hachette, 1906 (Wikisource) — https://fr.wikisource.org/wiki/L%E2%80%99Entraide,_un_facteur_de_l%E2%80%99%C3%A9volution/Chapitre_II
  - it: Il mutuo appoggio fattore dell'evoluzione, trad. Camillo Berneri, Libreria Internazionale di Avanguardia, Bologna, 1950 (Liber Liber e-book) — https://liberliber.eu/mediateca/libri/k/kropotkin/il_mutuo_appoggio/pdf/kropotkin_il_mutuo_appoggio.pdf
- Under a government which imprisons any unjustly, the true place for a…
  - it: La disobbedienza civile, a cura di Franco Meli, trad. Laura Gentili, SE, Milano, 1992, p. 29 (via Wikiquote it) — https://it.wikiquote.org/wiki/Henry_David_Thoreau
  - fr: La désobéissance civile, trad. Jacques Mailhos, Gallmeister (Totem), 2017, p. 20 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Henry_David_Thoreau
- Soyez résolus de ne servir plus, et vous voilà libres. - Étienne de La…
  - it: Discorso sulla servitù volontaria, trad. Vincenzo Papa, Edizioni Immanenza, Napoli, 2014, p. 36 (via Wikiquote it) — https://it.wikiquote.org/wiki/%C3%89tienne_de_La_Bo%C3%A9tie
  - en: Anti-Dictator (Discourse on Voluntary Servitude), trans. Harry Kurz, 1942 (via Wikiquote en) — https://en.wikiquote.org/wiki/%C3%89tienne_de_La_Bo%C3%A9tie
- We live in capitalism, its power seems inescapable – but then, so did…
  - it: Fantascienza.com, 'Ursula Le Guin, ecco lo storico discorso al National Book Award', 24 Nov 2014 (full speech in Italian, translator NOT named) — https://www.fantascienza.com/19495/ursula-le-guin-ecco-lo-storico-discorso-al-national-book-award
- Disobedience, in the eyes of any one who has read history, is man's or…
  - it: L'anima dell'uomo sotto il socialismo, trad. Marco Vignolo Gargini (blog publication, 2014) — https://marteau7927.wordpress.com/2014/06/30/oscar-wilde-lanima-delluomo-sotto-il-socialismo-ii/
  - fr: L'Âme humaine sous le régime socialiste, in Le Portrait de Monsieur W. H., trad. Albert Savine, Stock, 1906 (Wikisource) — https://fr.wikisource.org/wiki/Le_Portrait_de_Monsieur_W._H._(recueil)/L%E2%80%99%C3%82me_humaine_sous_le_r%C3%A9gime_socialiste

### antifascism

- Se voi volete andare in pellegrinaggio nel luogo dove è nata la nostra…
  - en: Gariwo Foundation, English page 'Piero Calamandrei' (no translator named); near-identical wording in ANSA English, 25 Apr 2023 — https://en.gariwo.net/righteous/democracy/piero-calamandrei-29115.html
- Oggi in Spagna, domani in Italia. - Carlo Rosselli
  - en: Carlo Rosselli, Liberal Socialism, ed. Nadia Urbinati, trans. William McCuaig, Princeton University Press (editor's introduction) — https://doi.org/10.1515/9781400887309
  - fr: Stéfanie Prezioso, « "Aujourd'hui en Espagne, demain en Italie" », Vingtième Siècle. Revue d'histoire, n° 93, 2007, pp. 79-91 — https://shs.cairn.info/revue-vingtieme-siecle-revue-d-histoire-2007-1-page-79
- ¡No pasarán! - Dolores Ibárruri
  - it: Wikiquote (it), page Dolores Ibárruri (citing Dizionario delle citazioni, ed. Italo Sordi, BUR 1992) — https://it.wikiquote.org/wiki/Dolores_Ib%C3%A1rruri
  - en: Dolores Ibárruri, Speeches and Articles, Foreign Languages Publishing House, 1938, pp. 7-8 (via Marxists Internet Archive; also on en.wikiquote, page Dolores Ibárruri) — https://www.marxists.org/archive/ibarruri/1936/07/19.htm
- Unglücklich das Land, das Helden nötig hat. - Bertolt Brecht
  - it: Wikiquote (it), page Bertolt Brecht, Vita di Galileo, scene XIII; translation by Emilio Castellani (Teatro, Einaudi, 1963) — https://it.wikiquote.org/wiki/Bertolt_Brecht
  - en: Wikiquote (en), page Bertolt Brecht, Life of Galileo, translation by Charles Laughton (with Brecht), ISBN 0-8021-3059-3, scene 12 p. 115 — https://en.wikiquote.org/wiki/Bertolt_Brecht
  - fr: La Vie de Galilée, trad. Éloi Recoing, L'Arche, 1990, scène 13, pp. 118-119 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Bertolt_Brecht
- Der Schoß ist fruchtbar noch, aus dem das kroch. - Bertolt Brecht
  - en: The Resistible Rise of Arturo Ui, Epilogue, tr. Ralph Manheim, 1976 (via Wikiquote en) — https://en.wikiquote.org/wiki/Bertolt_Brecht
  - fr: La Résistible Ascension d'Arturo Ui, trad. Armand Jacob, Théâtre complet de Bertolt Brecht, L'Arche, vol. 5, p. 237 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Bertolt_Brecht
  - it: B. Brecht, La resistibile ascesa di Arturo Ui, Einaudi, Torino, 1963, p. 127 (as quoted in a thesis on academia.edu; translator not named there); same wording widely quoted (Il Foglio 2019, Avanti! 2024) — https://academia.edu/40363650/Il_teatro_epico_di_Brecht_e_il_nazismo_Furcht_und_Elend_des_dritten_Reiches_e_der_aufhaltsame_Aufstieg_des_Arturo_Ui_
- Wir schweigen nicht, wir sind Euer böses Gewissen; die Weiße Rose läßt…
  - en: Wikiquote (en), page White Rose, Fourth Leaflet (translation as linked from zulutango.com/whiterose) — https://en.wikiquote.org/wiki/White_Rose
  - fr: Weiße Rose Stiftung e.V., French short version of the exhibition 'La Rose Blanche' (2015) — http://weisse-rose-stiftung.de/wp-content/uploads/pdf/Ausstellung-Kurzfassung-fr-neu2015.pdf
  - it: As quoted in 'Sophie Scholl: una voce europea', Rivista DiCultHer (also DISF.org, Note di Pastorale Giovanile); standard Italian rendering, translator/edition not named — https://diculther.it/rivista/sophie-scholl-una-voce-europea
- Every line of serious work that I have written since 1936 has been wri…
  - fr: « Pourquoi j'écris », in Orwell, Œuvres, Bibliothèque de la Pléiade, Gallimard, 2020 (as quoted in Nonfiction.fr review; translator not named in the review) — https://nonfiction.fr/article-10594-george-orwell-en-pleiade.htm
- War is peace. Freedom is slavery. Ignorance is strength. - George Orwe…
  - it: Wikiquote (it), page 1984 (reference edition: tr. Stefano Manferlotti, Mondadori, 2020) — https://it.wikiquote.org/wiki/1984
  - fr: 1984, Gallimard, coll. Folio, part I ch. 1, p. 15 (tr. Amélie Audiberti) via Wikiquote (fr) — https://fr.wikiquote.org/wiki/1984
- All animals are equal but some animals are more equal than others. - G…
  - fr: La Ferme des animaux, tr. Jean Queval, Gallimard, 1984, ch. 10, p. 144 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/George_Orwell
- As a woman I have no country. As a woman I want no country. As a woman…
  - fr: Trois guinées, Éditions Des femmes, 1977, p. 205 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Virginia_Woolf
  - it: As quoted in Rosi Braidotti, Nuovi soggetti nomadi (footnote 52); same wording in Lapis 29 (women.it) and Doppiozero; Italian ed. Le tre ghinee, tr. Adriana Bottini, Feltrinelli, not directly verified — https://prod-cdn.atria.nl/wp-content/uploads/sites/2/2019/01/22103653/BIDD-8887995311.pdf
- The hate of men will pass, and dictators die, and the power they took…
  - it: Wikiquote (it), page Il grande dittatore, final speech (Italian dubbed version) — https://it.wikiquote.org/wiki/Il_grande_dittatore
  - fr: Wikipédia (fr), page Le Dictateur, French text of the final speech (translator not named); identical wording in Fondation Fellini press release 2022 and Mediapart — https://fr.wikipedia.org/wiki/Le_Dictateur
- The fundamental cause of the trouble is that in the modern world the s…
  - it: Wikiquote (it), page Bertrand Russell (with English original from The Triumph of Stupidity, 10 May 1933); no translator named — https://it.wikiquote.org/wiki/Bertrand_Russell
- Ur-Fascism is still around us, sometimes in plainclothes. - Umberto Ec…
  - it: Umberto Eco, Il fascismo eterno, La nave di Teseo, Milano, 2018, pp. 49-50 (Eco's own Italian text, via Wikiquote it) — https://it.wikiquote.org/wiki/Umberto_Eco
  - fr: Umberto Eco, Reconnaître le fascisme, Grasset, 2017 (1st French ed. 2010) (via Wikiquote fr; translator not named on page) — https://fr.wikiquote.org/wiki/Umberto_Eco
- Es gibt kein richtiges Leben im falschen. - Theodor W. Adorno
  - en: Minima Moralia, tr. E. F. N. Jephcott (1974), § 18 (via Wikiquote en) — https://en.wikiquote.org/wiki/Theodor_Adorno
  - it: Minima moralia, tr. Renato Solmi, Einaudi (as quoted by F. Tedesco, 2022, 'nella traduzione di Renato Solmi') — https://www.openstarts.units.it/bitstreams/e2d8b9ee-7182-4a0a-9d86-ded0b48d2994/download
- the lesson that this long course in human wickedness had taught us – t…
  - it: La banalità del male, tr. Piero Bernardini, Feltrinelli (as quoted in Bethania Assy, Rivista internazionale di filosofia e psicologia, 2 (2011), n. 2) — https://rifp.it/ojs/index.php/rifp/en/article/download/rifp.2011.0012/92/411
  - fr: Eichmann à Jérusalem, tr. Anne Guérin, Gallimard (as quoted in Raison publique, 'Absence de pensée et responsabilité chez Hannah Arendt'); same wording in a Université de Montréal thesis — https://raison-publique.fr/1867
- Ho imparato che il problema degli altri è uguale al mio. Sortirne tutt…
  - en: School of Barbiana, Letter to a Teacher, tr. Nora Rossi and Tom Cole (1970), section 'Politics or stinginess' (full-text PDF) — https://www.arvindguptatoys.com/arvindgupta/letter.pdf
  - fr: Lettre à une maîtresse d'école par les enfants de Barbiana, Mercure de France, 1968 (as quoted by Jacques Cornet, TRACeS n° 210, CGé) — https://changement-egalite.be/plaidoyer-pour-une-tres-mauvaise/
- Io so. Ma non ho le prove. Non ho nemmeno indizi. - Pier Paolo Pasolin…
  - fr: As quoted in Roberto Saviano, Gomorra, tr. Vincent Raynaud, Gallimard, 2006, p. 253 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Pier_Paolo_Pasolini
  - en: 'What is this coup d'état? I know', English translation of the 14 Nov 1974 Corriere della Sera column, Overland, 28 March 2012 (translator not checked) — https://overland.org.au/2012/03/what-is-this-coup-detat-i-know/
- Il secondo è rischioso ed esige attenzione e apprendimento continui: c…
  - en: Invisible Cities, tr. William Weaver, HBJ, 1974, section 9, p. 165 (via Wikiquote en) — https://en.wikiquote.org/wiki/Italo_Calvino
  - fr: Les Villes invisibles, tr. Martin Rueff, Gallimard, Folio, 2019, ch. IX, pp. 207-208 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Italo_Calvino
- Je me révolte, donc nous sommes. - Albert Camus
  - en: Wikiquote (en), page Albert Camus, The Rebel (1951) section (English translation by Anthony Bower) — https://en.wikiquote.org/wiki/Albert_Camus
  - it: L'uomo in rivolta, tr. Liliana Magrini, Bompiani, 1957, pp. 26-27 (as quoted on salto.bz; same in many academic citations of the Bompiani edition) — https://salto.bz/it/article/07112013/mi-rivolto-dunque-siamo
- «Tutti gli usi della parola a tutti» mi sembra un buon motto, dal bel…
  - en: Gianni Rodari, The Grammar of Fantasy, tr. Jack Zipes, Teachers & Writers Collaborative, 1996, p. 4 (as quoted by Patrick Ryan, IBBY Congress 2010) — https://ibby.org/subnavigation/archives/ibby-congresses/congress-2010/detailed-programme-and-speeches/patrick-ryan

### anticolonialism

- Une civilisation qui s'avère incapable de résoudre les problèmes que s…
  - en: Discourse on Colonialism, trans. Joan Pinkham, Monthly Review Press (1972/2000) — https://archive.org/stream/DiscourseOnColonialismAimeCesaire/Discourse%20on%20colonialism%20-%20Aime%20Cesaire_djvu.txt
  - it: Discorso sul colonialismo, a cura di Miguel Mellino, ombre corte, Verona, 2010, p. 45 (as quoted in M. Tolomelli, Storicamente, 2016) — https://storicamente.org/tolomelli-dall-anticolonialismo-all-anti-imperialismo
- Chaque génération doit, dans une relative opacité, découvrir sa missio…
  - en: The Wretched of the Earth, trans. Constance Farrington, Grove Press (1963), ch. 4 — https://archive.org/stream/TheWretchedOfTheEarthFrantzFanon/The%20wretched%20of%20the%20Earth%20-%20The%20Wretched%20of%20the%20Earth_djvu.txt
  - it: I dannati della terra, trad. Carlo Cignetti, Einaudi, Torino, 1962 — https://psicologiadimassadelfascismo.wordpress.com/wp-content/uploads/2017/10/fanon-i-dannati-della-terra.pdf
- I have cherished the ideal of a democratic and free society in which a…
  - fr: Le Monde, 'Mandela : les discours entrés dans l'Histoire', 6 Dec 2013 (translator NOT named) — https://www.lemonde.fr/afrique/article/2013/12/06/mandela-les-discours-entres-dans-l-histoire_3526530_3212.html
  - it: Mandela Forum (Firenze), page '20 Aprile 1964: Processo di Rivonia' (translator NOT named) — https://www.mandelaforum.it/eventi/20-aprile-1964-processo-di-rivonia-mandela-pronuncia-il-suo-discorso-prima-della-condanna-allergastolo/
- Injustice anywhere is a threat to justice everywhere. - Martin Luther…
  - it: Wikiquote (it), page Martin Luther King; cited in Elena Spagnol, Enciclopedia delle citazioni, Garzanti, 2009 — https://it.wikiquote.org/wiki/Martin_Luther_King

### feminism

- I do not wish them to have power over men; but over themselves. - Mary…
  - it: Il libro del femminismo, trad. Martina Dominici, Gribaudo, 2019, p. 34 (via Wikiquote it) — https://it.wikiquote.org/wiki/Mary_Wollstonecraft
  - fr: Défense des droits des femmes, Paris, Buisson / Lyon, Bruyset, 1792, ch. IV (anonymous contemporary translation, Wikisource) — https://fr.wikisource.org/wiki/D%C3%A9fense_des_droits_des_femmes/04
- La femme a le droit de monter sur l'échafaud ; elle doit avoir égaleme…
  - it: Dichiarazione dei diritti della donna e della cittadina, art. X, trad. Simonetta Micale (via Wikiquote it) — https://it.wikiquote.org/wiki/Olympe_de_Gouges
  - en: Women in Revolutionary Paris 1789-1795, ed./trans. Darline Gay Levy, Harriet B. Applewhite, Mary D. Johnson, University of Illinois Press, 1979, pp. 89-96 — https://pages.uoregon.edu/dluebke/301ModernEurope/GougesRightsofWomen.pdf
- On ne naît pas femme : on le devient. - Simone de Beauvoir
  - it: Il secondo sesso, trad. Roberto Cantini e Mario Andreose, il Saggiatore, Milano, 2008 (via Wikiquote it) — https://it.wikiquote.org/wiki/Simone_de_Beauvoir
  - en: The Second Sex, trans. H. M. Parshley (1953; Vintage 1972), Bk. 2, Pt. 4, Ch. 1, p. 267 (via Wikiquote en) — https://en.wikiquote.org/wiki/Simone_de_Beauvoir
- a woman must have money and a room of her own if she is to write ficti…
  - it: Una stanza tutta per sé, trad. J. Rodolfo Wilcock e Livio Bacchi Wilcock, Feltrinelli, 2013 (via Wikiquote it) — https://it.wikiquote.org/wiki/Virginia_Woolf
  - fr: Une chambre à soi, trad. Clara Malraux, 10/18, 1996, p. 8 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Virginia_Woolf
- For the master's tools will never dismantle the master's house. - Audr…
  - it: Wikiquote (it), page Audre Lorde — https://it.wikiquote.org/wiki/Audre_Lorde
  - fr: Sister Outsider, éd. Mamalis, 2018, p. 119 (via Wikiquote fr) — https://fr.wikiquote.org/wiki/Audre_Lorde
- Pies, ¿para qué los quiero si tengo alas pa' volar? - Frida Kahlo
  - en: Wikiquote (en), page Frida Kahlo (diary, 1953; reproduced in Hayden Herrera, Frida, 1983, p. 415) — https://en.wikiquote.org/wiki/Frida_Kahlo

### philosophy

- Ὁ θάνατος οὐδὲν πρὸς ἡμᾶς· τὸ γὰρ διαλυθὲν ἀναισθητεῖ· τὸ δ᾽ ἀναισθητο…
  - it: Wikiquote (it), page Epicuro, Massime Capitali II (translator not stated per quote; page bibliography: Epicuro, Opere, trad. Graziano Arrighetti, Einaudi, 1973) — https://it.wikiquote.org/wiki/Epicuro
  - en: Epicurus, Principal Doctrines 2, translated by Robert Drew Hicks (Wikisource) — https://en.wikisource.org/wiki/Principal_Doctrines
  - fr: Wikisource (fr), 'Les Idées antiques sur la mort et la critique de ces idées par Épicure' (19th-c. article quoting the Maxims; same wording in J.-M. Guyau, La Morale d’Épicure, Wikisource) — https://fr.wikisource.org/wiki/Les_Id%C3%A9es_antiques_sur_la_mort_et_la_critique_de_ces_id%C3%A9es_par_%C3%89picure
- Tantum religio potuit suadere malorum. - Lucretius
  - it: Wikiquote (it), page Tito Lucrezio Caro, De rerum natura I, 101 (translator not stated per quote) — https://it.wikiquote.org/wiki/Tito_Lucrezio_Caro
  - en: Wikiquote (en), page Lucretius, De rerum natura I, line 101 (translator not stated for this line) — https://en.wikiquote.org/wiki/Lucretius
  - fr: Lucrèce, De la nature des choses, traduction (en vers) par André Lefèvre, Société d’éditions littéraires, 1899 (Wikisource) — https://fr.wikisource.org/wiki/De_la_nature_des_choses_(traduction_Lef%C3%A8vre)/Livre_I
- Homo sum, humani nihil a me alienum puto. - Terentius
  - it: Wikiquote (it), page Publio Terenzio Afro; cited in Françoise Waquet, Latino. L'impero di un segno, trad. Alessandro Serra, Feltrinelli, 2004, p. 293 — https://it.wikiquote.org/wiki/Publio_Terenzio_Afro
  - en: Wikiquote (en), page Terence, Heauton Timorumenos — https://en.wikiquote.org/wiki/Terence
  - fr: Wikiquote (fr), page Térence; Térence, tome II, Collection des Universités de France, Les Belles Lettres, p. 23 — https://fr.wikiquote.org/wiki/T%C3%A9rence
- Sed omnia praeclara tam difficilia quam rara sunt. - Benedictus de Spi…
  - it: Wikiquote (it), page Ethica; Spinoza, Etica, trad. Sossio Giametta, Bollati Boringhieri, 1992 — https://it.wikiquote.org/wiki/Ethica
  - en: Wikiquote (en), page Baruch Spinoza, Ethics V, Prop. XLII, Scholium (translator not named on the page) — https://en.wikiquote.org/wiki/Baruch_Spinoza
  - fr: Spinoza, Éthique, traduction par Émile Saisset, Charpentier, 1861 (Wikisource) — https://fr.wikisource.org/wiki/%C3%89thique_(Saisset,_1861)/Partie_V
- Sedulo curavi, humanas actiones non ridere, non lugere, neque detestar…
  - en: Wikiquote (en), page Baruch Spinoza, Political Treatise ch. 1 — https://en.wikiquote.org/wiki/Baruch_Spinoza
  - fr: Spinoza, Traité politique, ch. I §4, traduction par Émile Saisset, Charpentier, 1861 (Wikisource) — https://fr.wikisource.org/wiki/Trait%C3%A9_politique/Introduction
- Parce que c'était lui, parce que c'était moi. - Michel de Montaigne
  - it: Wikiquote (it), page Michel de Montaigne (Saggi I, XXVIII); Montaigne, Saggi, trad. Fausta Garavini, Bompiani, 2014 — https://it.wikiquote.org/wiki/Michel_de_Montaigne
- Le cœur a ses raisons que la raison ne connaît point. - Blaise Pascal
  - it: Wikiquote (it), page Cuore (attributed to Blaise Pascal; translator not named) — https://it.wikiquote.org/wiki/Cuore
  - en: Wikiquote (en), page Pensées — https://en.wikiquote.org/wiki/Pensées
- No Arts; no Letters; no Society; and which is worst of all, continuall…
  - it: Wikiquote (it), page Thomas Hobbes, Leviatano I, XIII (page bibliography: trad. Francesco Moffa, Carabba 1932; trad. Roberto Giammanco, UTET 1955) — https://it.wikiquote.org/wiki/Thomas_Hobbes
- L'homme est né libre, et partout il est dans les fers. - Jean-Jacques…
  - it: Wikiquote (it), page Jean-Jacques Rousseau, Il contratto sociale, incipit (page bibliography: Del contratto sociale, trad. Rodolfo Mondolfo) — https://it.wikiquote.org/wiki/Jean-Jacques_Rousseau
  - en: Wikiquote (en), page The Social Contract, Book I, ch. 1 — https://en.wikiquote.org/wiki/The_Social_Contract
- Le premier qui, ayant enclos un terrain, s'avisa de dire : Ceci est à…
  - it: Wikiquote (it), page Jean-Jacques Rousseau, Discorso sull'origine della disuguaglianza (page bibliography: trad. Rodolfo Mondolfo) — https://it.wikiquote.org/wiki/Jean-Jacques_Rousseau
  - en: Wikiquote (en), page Discourse on Inequality, part II ('This is mine' in italics on page) — https://en.wikiquote.org/wiki/Discourse_on_Inequality
- Cela est bien dit, répondit Candide, mais il faut cultiver notre jardi…
  - en: Wikiquote (en), page Candide, ch. xxx (translator not stated) — https://en.wikiquote.org/wiki/Candide
- Sapere aude! Habe Mut, dich deines eigenen Verstandes zu bedienen! ist…
  - it: Wikiquote (it), page Immanuel Kant (Risposta alla domanda: che cos'è l'Illuminismo?; translator not named) — https://it.wikiquote.org/wiki/Immanuel_Kant
  - en: Kant, What is Enlightenment?, translated by Lewis White Beck (Wikisource) — https://en.wikisource.org/wiki/What_is_Enlightenment%3F
  - fr: Kant, Réponse à la question : Qu’est-ce que les lumières ?, traduction par Jules Barni (Métaphysique des mœurs, trad. Barni, tome I), Wikisource — https://fr.wikisource.org/wiki/M%C3%A9taphysique_des_m%C5%93urs_(trad._Barni)/Tome_I/PERAD/R%C3%A9ponse
- Zwei Dinge erfüllen das Gemüt mit immer neuer und zunehmender Bewunder…
  - it: Wikiquote (it), page Immanuel Kant; Critica della ragion pratica, trad. Francesco Capra e Eugenio Garin, Laterza, 2006, Conclusione, p. 353 — https://it.wikiquote.org/wiki/Immanuel_Kant
  - en: Kant, Critique of Practical Reason, Conclusion, translated by Thomas Kingsmill Abbott (Wikisource) — https://en.wikisource.org/wiki/Critique_of_Practical_Reason
  - fr: Kant, Critique de la raison pratique, Conclusion, traduction par Jules Barni, Ladrange, 1848 (Wikisource) — https://fr.wikisource.org/wiki/Critique_de_la_raison_pratique_(trad._Barni)/P2/Conclusion
- Was vernünftig ist, das ist wirklich; und was wirklich ist, das ist ve…
  - it: Wikiquote (it), page Georg Wilhelm Friedrich Hegel, Lineamenti di filosofia del diritto, Prefazione, p. 14 (translator not named per quote) — https://it.wikiquote.org/wiki/Georg_Wilhelm_Friedrich_Hegel
  - en: Wikiquote (en), page Georg Wilhelm Friedrich Hegel, Philosophy of Right, Preface — https://en.wikiquote.org/wiki/Georg_Wilhelm_Friedrich_Hegel
- Die Eule der Minerva beginnt erst mit der einbrechenden Dämmerung ihre…
  - it: Wikiquote (it), page Georg Wilhelm Friedrich Hegel, Lineamenti di filosofia del diritto, Prefazione, p. 17 — https://it.wikiquote.org/wiki/Georg_Wilhelm_Friedrich_Hegel
  - en: Wikiquote (en), page Georg Wilhelm Friedrich Hegel, Philosophy of Right, Preface — https://en.wikiquote.org/wiki/Georg_Wilhelm_Friedrich_Hegel
- Det er ganske sandt, hvad Philosophien siger, at Livet maa forstaaes b…
  - it: Wikiquote (it), page Søren Kierkegaard (§ 749); Kierkegaard, Diario, a cura di Cornelio Fabro, Morcelliana, 1962 — https://it.wikiquote.org/wiki/Søren_Kierkegaard
  - en: Wikiquote (en), page Søren Kierkegaard (Journals) — https://en.wikiquote.org/wiki/Søren_Kierkegaard
- If all mankind minus one, were of one opinion, and only one person wer…
  - fr: John Stuart Mill, De la liberté, trad. Charles Brook Dupont-White, Guillaumin et Cie 1860 (Wikisource fr) — https://fr.wikisource.org/wiki/De_la_libert%C3%A9/Texte_entier
  - it: John Stuart Mill, La libertà, BUR, 1999, p. 85 (translator not named), as quoted on Wikibooks (it), Storia della filosofia/John Stuart Mill — https://it.wikibooks.org/wiki/Storia_della_filosofia/John_Stuart_Mill
- Aus der Kriegsschule des Lebens. — Was mich nicht umbringt, macht mich…
  - it: Wikiquote (it), page Friedrich Nietzsche, Crepuscolo degli idoli, Detti e frecce 8 (1989 edition cited on page) — https://it.wikiquote.org/wiki/Friedrich_Nietzsche
  - en: Wikiquote (en), page Twilight of the Idols, Maxims and Arrows 8 — https://en.wikiquote.org/wiki/Twilight_of_the_Idols
  - fr: Nietzsche, Le Crépuscule des Idoles, Maximes et pointes 8, traduction par Henri Albert (Wikisource) — https://fr.wikisource.org/wiki/Le_Cr%C3%A9puscule_des_Idoles/Maximes_et_pointes
- Gott ist todt! Gott bleibt todt! Und wir haben ihn getödtet! - Friedri…
  - it: Wikiquote (it), voce tematica Morte di Dio, attributed to Friedrich Nietzsche (translator not named on the page) — https://it.wikiquote.org/wiki/Morte_di_Dio
  - en: Wikiquote (en), page Friedrich Nietzsche, The Gay Science §125 — https://en.wikiquote.org/wiki/Friedrich_Nietzsche
  - fr: Nietzsche, Le Gai Savoir §125, traduction par Henri Albert, Mercure de France, 1901 (Wikisource) — https://fr.wikisource.org/wiki/Le_Gai_Savoir/Livre_troisi%C3%A8me
- Wer mit Ungeheuern kämpft, mag zusehn, dass er nicht dabei zum Ungeheu…
  - it: Wikiquote (it), page Friedrich Nietzsche, Al di là del bene e del male §146 (2007 edition cited on page) — https://it.wikiquote.org/wiki/Friedrich_Nietzsche
  - en: Wikiquote (en), page Beyond Good and Evil, aphorism 146 (translator not named) — https://en.wikiquote.org/wiki/Beyond_Good_and_Evil
  - fr: Nietzsche, Par delà le bien et le mal §146, traduction par Henri Albert, Mercure de France, 1913 (Wikisource) — https://fr.wikisource.org/wiki/Par_del%C3%A0_le_bien_et_le_mal/Chapitre_IV._Maximes_et_interm%C3%A8des
- Wovon man nicht sprechen kann, darüber muss man schweigen. - Ludwig Wi…
  - en: Wikiquote (en), page Ludwig Wittgenstein, Tractatus 7 — https://en.wikiquote.org/wiki/Ludwig_Wittgenstein
  - fr: Wikiquote (fr), page Ludwig Wittgenstein; Tractatus logico-philosophicus 7, trad. Christiane Chauviré et Sabine Plaud, Flammarion, 2022, p. 228 — https://fr.wikiquote.org/wiki/Ludwig_Wittgenstein
- Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt. - Ludwig…
  - it: Wikiquote (it), page Ludwig Wittgenstein, Tractatus 5.6 (page bibliography: a cura di Amedeo G. Conte, Einaudi, 1989) — https://it.wikiquote.org/wiki/Ludwig_Wittgenstein
  - en: Wikiquote (en), page Language (Wittgenstein, Tractatus 5.6) — https://en.wikiquote.org/wiki/Language
  - fr: Wikiquote (fr), page Ludwig Wittgenstein; Carnets 1914-1916 (entry 23.5.15, = Tractatus 5.6), trad. G.-G. Granger, Gallimard, 1997, p. 102 — https://fr.wikiquote.org/wiki/Ludwig_Wittgenstein
- C'est ce que j'exprimerai en disant que l'homme est condamné à être li…
  - it: Wikiquote (it), page Jean-Paul Sartre, L'esistenzialismo è un umanismo (page bibliography lists a translation by 'G.' ...) — https://it.wikiquote.org/wiki/Jean-Paul_Sartre
  - en: Sartre, Existentialism Is a Humanism, translated by Philip Mairet (in Existentialism from Dostoyevsky to Sartre, ed. Walter Kaufmann, Meridian 1989), marxists.org — https://www.marxists.org/reference/archive/sartre/works/exist/sartre.htm
- L'enfer, c'est les Autres. - Jean-Paul Sartre
  - it: Wikiquote (it), page Jean-Paul Sartre; from A porte chiuse, cited in Dizionario delle citazioni — https://it.wikiquote.org/wiki/Jean-Paul_Sartre
- Il faut imaginer Sisyphe heureux. - Albert Camus
  - it: Wikiquote (it), page Albert Camus; Il mito di Sisifo, trad. Attilio Borrelli, Bompiani — https://it.wikiquote.org/wiki/Albert_Camus
  - en: Wikiquote (en), page Albert Camus, The Myth of Sisyphus — https://en.wikiquote.org/wiki/Albert_Camus

### literature

- We are all in the gutter, but some of us are looking at the stars. - O…
  - it: Ginevra Vivante, in Oscar Wilde, Tutte le opere, 2010 (via Wikiquote it) — https://it.wikiquote.org/wiki/Oscar_Wilde#Il_ventaglio_di_Lady_Windermere
- So it goes. - Kurt Vonnegut
  - it: Luigi Brioschi, Mattatoio n. 5, Feltrinelli 2017 (via Wikiquote it) — https://it.wikiquote.org/wiki/Kurt_Vonnegut#Mattatoio_n._5
- On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les ye…
  - it: Yasmina Melaouah, Il piccolo principe, Gribaudo 2015, cap. XXI, p. 97 (per bibliografia Wikiquote it) — https://it.wikiquote.org/wiki/Antoine_de_Saint-Exup%C3%A9ry#Il_piccolo_principe
  - en: Wikiquote (en), page The Little Prince (Katherine Woods' translation, 1943) — https://en.wikiquote.org/wiki/The_Little_Prince
- Não sou nada. Nunca serei nada. Não posso querer ser nada. À parte iss…
  - it: Antonio Tabucchi, in Poesie di Álvaro de Campos, a cura di Maria José de Lancastre, Adelphi 2007, p. 199 (via Wikiquote it) — https://it.wikiquote.org/wiki/Fernando_Pessoa
  - en: Jonathan Griffin, Selected Poems, Penguin Books 1974, p. 111 (via Wikiquote en) — https://en.wikiquote.org/wiki/Fernando_Pessoa
  - fr: Fernando Pessoa, Œuvres poétiques, Gallimard (Bibliothèque de la Pléiade) 2001, p. 362 (via Wikiquote fr; translator not named on page) — https://fr.wikiquote.org/wiki/Fernando_Pessoa

### politics

- government of the people, by the people, for the people, shall not per…
  - fr: Wikiquote (fr), page Abraham Lincoln (translation credited to Wikisource) — https://fr.wikiquote.org/wiki/Abraham_Lincoln
  - it: Antonio Agresti, Abramo Lincoln, 1913 (translation of the speech quoted in the biography; Wikisource it) — https://it.wikisource.org/wiki/Abramo_Lincoln/Biografia
- So, first of all, let me assert my firm belief that the only thing we…
  - it: Wikiquote (it), page Franklin Delano Roosevelt (no translator named) — https://it.wikiquote.org/wiki/Franklin_Delano_Roosevelt
