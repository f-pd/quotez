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
