/** Text of the About page, per interface language (en, it, fr). */

export const REPO_URL = 'https://github.com/f-pd/quotez';
export const RFC_URL = 'https://www.rfc-editor.org/rfc/rfc865';

export type AboutText = {
  /** Footer link label */
  link: string;
  title: string;
  intro: string;
  protocolTitle: string;
  protocol: string;
  portsTitle: string;
  ports: string;
  tryIt: string;
  siteTitle: string;
  site: string;
  licenseTitle: string;
  license: string;
  source: string;
  independentTitle: string;
  independent: string;
  numbersTitle: string;
  numbersIntro: (date: string, commit: string) => string;
  noData: string;
  imageTitle: string;
  imageCompressed: (size: string, platform: string) => string;
  imageLocal: (image: string, binary: string) => string;
  loadTitle: string;
  loadIntro: (cpu: string, cores: number, p95: number, step: string) => string;
  colLimits: string;
  colHolds: string;
  colSuffers: string;
  colMemory: string;
  perSecond: (n: string) => string;
  notReached: string;
  reason: (kind: string, value: number | null) => string;
  prodTitle: string;
  prod: (rate: number, seconds: number, target: string, ok: string, p50: string, p95: string) => string;
  aiTitle: string;
  ai: string;
  back: string;
};

const ABOUT: Record<string, AboutText> = {
  en: {
    link: 'About',
    title: 'About Quotez',
    intro:
      'Quotez is a small Quote of the Day server: you connect, it sends you a quote, it closes the connection. Nothing else.',
    protocolTitle: 'Quote of the Day (RFC 865)',
    protocol:
      'The Quote of the Day protocol is defined by RFC 865 (1983). The server answers every TCP connection or UDP datagram with a short message, under 512 characters, and ignores whatever the client sends.',
    portsTitle: 'Ports',
    ports:
      'Port 17 is the standard QOTD port. Port 8017 serves the same quotes on an unprivileged port. Both accept TCP and UDP.',
    tryIt: 'Try it from a terminal:',
    siteTitle: 'This website',
    site:
      'The website shows the same quotes in a browser, in three styles (Zen, Rich, Simple) and in several languages, with the original text of each quote one click away. Quotes too long for the 512 character limit appear only here.',
    licenseTitle: 'License',
    license: 'Quotez is free software, released under the GNU General Public License v3.0 (GPL-3.0).',
    source: 'Source code',
    independentTitle: 'An independent server',
    independent:
      'The QOTD server stands on its own: one static binary written in Zig, with no dependencies, shipped in a Docker image built FROM scratch. It reads quotes from files on disk, notices when they change and reloads them, and answers ports 17 and 8017 from a single event loop. It needs neither this website nor a database. The web interface is a separate, optional service, there only for convenience and a more modern look: it reads the same quotes from the server\u2019s HTTP routes.',
    numbersTitle: 'Measured numbers',
    numbersIntro: (date, commit) =>
      `Measured automatically by the CI on every change to the main branch. Last update: ${date}, commit ${commit}.`,
    noData: 'Measurements are not available yet: they appear after the next CI run.',
    imageTitle: 'Docker image',
    imageCompressed: (size, platform) => `${size} to download (${platform})`,
    imageLocal: (image, binary) => `${image} on disk, of which ${binary} is the server binary`,
    loadTitle: 'Load test',
    loadIntro: (cpu, cores, p95, step) =>
      `The real image runs with limited CPU and memory on a GitHub Actions runner (${cpu}, ${cores} cores). k6 opens QOTD connections over TCP at increasing rates, ${step} per step, until the server suffers: fewer than 99% of connections answered, p95 latency over ${p95} ms, or less than 95% of the requested rate served. The load generator runs on the same machine, so the highest figures may be its limit rather than the server\u2019s.`,
    colLimits: 'Limits',
    colHolds: 'Holds up to',
    colSuffers: 'Suffers at',
    colMemory: 'Memory used',
    perSecond: (n) => `${n}/s`,
    notReached: 'not reached',
    reason: (kind, value) =>
      ({
        errors: `${value}% of connections failed`,
        latency: `p95 latency ${value} ms`,
        throughput: `only ${value}/s served`,
        stopped: 'the server stopped',
        generator: 'the load generator failed',
      })[kind] ?? kind,
    prodTitle: 'Production',
    prod: (rate, seconds, target, ok, p50, p95) =>
      `Light check after every deploy: ${rate} QOTD connections per second for ${seconds} s to ${target}, from a GitHub Actions runner. ${ok} answered, median ${p50}, p95 ${p95} (network included).`,
    aiTitle: 'Made with generative AI',
    ai:
      'This project was built with the help of generative artificial intelligence tools, for code, text and translations.',
    back: 'Back to the quotes',
  },
  it: {
    link: 'Info',
    title: 'Cos’è Quotez',
    intro:
      'Quotez è un piccolo server Quote of the Day: ti colleghi, ti manda una citazione, chiude la connessione. Nient’altro.',
    protocolTitle: 'Quote of the Day (RFC 865)',
    protocol:
      'Il protocollo Quote of the Day è definito dall’RFC 865 (1983). Il server risponde a ogni connessione TCP o datagramma UDP con un breve messaggio, sotto i 512 caratteri, e ignora qualunque cosa invii il client.',
    portsTitle: 'Porte',
    ports:
      'La porta 17 è la porta standard del QOTD. La porta 8017 serve le stesse citazioni su una porta non privilegiata. Entrambe accettano TCP e UDP.',
    tryIt: 'Provalo da un terminale:',
    siteTitle: 'Questo sito',
    site:
      'Il sito mostra le stesse citazioni nel browser, in tre stili (Zen, Rich, Simple) e in più lingue, con il testo originale di ogni citazione a portata di clic. Le citazioni troppo lunghe per il limite di 512 caratteri compaiono solo qui.',
    licenseTitle: 'Licenza',
    license: 'Quotez è software libero, distribuito con licenza GNU General Public License v3.0 (GPL-3.0).',
    source: 'Codice sorgente',
    independentTitle: 'Un server indipendente',
    independent:
      'Il server QOTD sta in piedi da solo: un unico binario statico scritto in Zig, senza dipendenze, distribuito in un\u2019immagine Docker costruita FROM scratch. Legge le citazioni da file su disco, si accorge quando cambiano e le ricarica, e risponde sulle porte 17 e 8017 da un solo event loop. Non ha bisogno né di questo sito né di un database. L\u2019interfaccia web è un servizio separato e facoltativo, che esiste solo per comodità e per un aspetto più moderno: legge le stesse citazioni dalle route HTTP del server.',
    numbersTitle: 'I numeri, misurati',
    numbersIntro: (date, commit) =>
      `Misurati in automatico dalla CI a ogni modifica del branch main. Ultimo aggiornamento: ${date}, commit ${commit}.`,
    noData: 'Le misure non sono ancora disponibili: compaiono dopo la prossima esecuzione della CI.',
    imageTitle: 'Immagine Docker',
    imageCompressed: (size, platform) => `${size} da scaricare (${platform})`,
    imageLocal: (image, binary) => `${image} su disco, di cui ${binary} di binario del server`,
    loadTitle: 'Test di carico',
    loadIntro: (cpu, cores, p95, step) =>
      `L\u2019immagine vera gira con CPU e memoria limitate su un runner GitHub Actions (${cpu}, ${cores} core). k6 apre connessioni QOTD via TCP a ritmo crescente, ${step} per gradino, finché il server non soffre: meno del 99% di connessioni servite, latenza p95 sopra ${p95} ms, o meno del 95% del ritmo richiesto. Il generatore di carico gira sulla stessa macchina, quindi i valori più alti possono essere il suo limite e non quello del server.`,
    colLimits: 'Limiti',
    colHolds: 'Regge fino a',
    colSuffers: 'Soffre a',
    colMemory: 'Memoria usata',
    perSecond: (n) => `${n}/s`,
    notReached: 'non raggiunto',
    reason: (kind, value) =>
      ({
        errors: `${value}% di connessioni fallite`,
        latency: `latenza p95 ${value} ms`,
        throughput: `servite solo ${value}/s`,
        stopped: 'il server si è fermato',
        generator: 'il generatore di carico ha fallito',
      })[kind] ?? kind,
    prodTitle: 'Produzione',
    prod: (rate, seconds, target, ok, p50, p95) =>
      `Controllo leggero dopo ogni deploy: ${rate} connessioni QOTD al secondo per ${seconds} s verso ${target}, da un runner GitHub Actions. ${ok} servite, mediana ${p50}, p95 ${p95} (rete compresa).`,
    aiTitle: 'Realizzato con AI generativa',
    ai:
      'Questo progetto è stato realizzato con l’aiuto di strumenti di intelligenza artificiale generativa, per codice, testi e traduzioni.',
    back: 'Torna alle citazioni',
  },
  fr: {
    link: 'À propos',
    title: 'À propos de Quotez',
    intro:
      'Quotez est un petit serveur Quote of the Day : vous vous connectez, il vous envoie une citation, il ferme la connexion. Rien de plus.',
    protocolTitle: 'Quote of the Day (RFC 865)',
    protocol:
      'Le protocole Quote of the Day est défini par la RFC 865 (1983). Le serveur répond à chaque connexion TCP ou datagramme UDP par un court message, de moins de 512 caractères, et ignore tout ce que le client envoie.',
    portsTitle: 'Ports',
    ports:
      'Le port 17 est le port standard du QOTD. Le port 8017 sert les mêmes citations sur un port non privilégié. Les deux acceptent TCP et UDP.',
    tryIt: 'Essayez depuis un terminal :',
    siteTitle: 'Ce site',
    site:
      'Le site affiche les mêmes citations dans le navigateur, en trois styles (Zen, Rich, Simple) et en plusieurs langues, avec le texte original de chaque citation à un clic. Les citations trop longues pour la limite de 512 caractères n’apparaissent qu’ici.',
    licenseTitle: 'Licence',
    license: 'Quotez est un logiciel libre, distribué sous la GNU General Public License v3.0 (GPL-3.0).',
    source: 'Code source',
    independentTitle: 'Un serveur indépendant',
    independent:
      'Le serveur QOTD fonctionne seul : un unique binaire statique écrit en Zig, sans dépendances, livré dans une image Docker construite FROM scratch. Il lit les citations dans des fichiers sur disque, remarque quand ils changent et les recharge, et répond sur les ports 17 et 8017 depuis une seule boucle d\u2019événements. Il n\u2019a besoin ni de ce site ni d\u2019une base de données. L\u2019interface web est un service séparé et facultatif, là seulement pour le confort et un aspect plus moderne : elle lit les mêmes citations via les routes HTTP du serveur.',
    numbersTitle: 'Les chiffres, mesurés',
    numbersIntro: (date, commit) =>
      `Mesurés automatiquement par la CI à chaque modification de la branche main. Dernière mise à jour : ${date}, commit ${commit}.`,
    noData: 'Les mesures ne sont pas encore disponibles : elles apparaîtront après la prochaine exécution de la CI.',
    imageTitle: 'Image Docker',
    imageCompressed: (size, platform) => `${size} à télécharger (${platform})`,
    imageLocal: (image, binary) => `${image} sur disque, dont ${binary} pour le binaire du serveur`,
    loadTitle: 'Test de charge',
    loadIntro: (cpu, cores, p95, step) =>
      `La vraie image tourne avec CPU et mémoire limités sur un runner GitHub Actions (${cpu}, ${cores} cœurs). k6 ouvre des connexions QOTD en TCP à un rythme croissant, ${step} par palier, jusqu\u2019à ce que le serveur souffre : moins de 99 % de connexions servies, latence p95 au-delà de ${p95} ms, ou moins de 95 % du rythme demandé. Le générateur de charge tourne sur la même machine, donc les valeurs les plus hautes peuvent être sa limite plutôt que celle du serveur.`,
    colLimits: 'Limites',
    colHolds: 'Tient jusqu\u2019à',
    colSuffers: 'Souffre à',
    colMemory: 'Mémoire utilisée',
    perSecond: (n) => `${n}/s`,
    notReached: 'non atteint',
    reason: (kind, value) =>
      ({
        errors: `${value} % de connexions en échec`,
        latency: `latence p95 ${value} ms`,
        throughput: `seulement ${value}/s servies`,
        stopped: 'le serveur s\u2019est arrêté',
        generator: 'le générateur de charge a échoué',
      })[kind] ?? kind,
    prodTitle: 'Production',
    prod: (rate, seconds, target, ok, p50, p95) =>
      `Vérification légère après chaque déploiement : ${rate} connexions QOTD par seconde pendant ${seconds} s vers ${target}, depuis un runner GitHub Actions. ${ok} servies, médiane ${p50}, p95 ${p95} (réseau compris).`,
    aiTitle: 'Réalisé avec l’IA générative',
    ai:
      'Ce projet a été réalisé avec l’aide d’outils d’intelligence artificielle générative, pour le code, les textes et les traductions.',
    back: 'Retour aux citations',
  },
};

/** About text for a locale (interface falls back to English) */
export function aboutFor(locale: string): AboutText {
  const base = (locale.split('-')[0] ?? locale).toLowerCase();
  return ABOUT[base] ?? (ABOUT.en as AboutText);
}
