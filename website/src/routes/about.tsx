import { useEffect } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { canonicalLocale, pickLocale } from '../lib/i18n';
import { aboutFor, REPO_URL, RFC_URL } from '../lib/about';
import { AboutStats } from '../components/AboutStats';
import '../styles/about.css';

const UI_LOCALES = { supported: ['en', 'it', 'fr'], default: 'en' };

/** /about and /$locale/about: what this server is */
export function AboutPage() {
  const params = useParams({ strict: false }) as { locale?: string };
  const urlLocale = params.locale ? canonicalLocale(params.locale) : null;
  const locale = urlLocale ?? pickLocale(UI_LOCALES);
  const t = aboutFor(locale);
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  useEffect(() => {
    document.documentElement.lang = locale;
    const previous = document.title;
    document.title = `${t.title} · Quotez`;
    return () => {
      document.title = previous;
    };
  }, [locale, t.title]);

  return (
    <div className="about-page" data-testid="about-page">
      <article className="about-content">
        <h1>{t.title}</h1>
        <p className="about-intro">{t.intro}</p>

        <h2>{t.protocolTitle}</h2>
        <p>
          {t.protocol}{' '}
          <a href={RFC_URL} target="_blank" rel="noreferrer">
            RFC 865
          </a>
        </p>

        <h2>{t.portsTitle}</h2>
        <p>{t.ports}</p>
        <p>{t.tryIt}</p>
        <pre className="about-code">
          <code>{`nc ${host} 17\necho | nc -u -w1 ${host} 8017`}</code>
        </pre>

        <h2>{t.independentTitle}</h2>
        <p>{t.independent}</p>

        <h2>{t.siteTitle}</h2>
        <p>{t.site}</p>

        <AboutStats t={t} locale={locale} />

        <h2>{t.licenseTitle}</h2>
        <p>{t.license}</p>
        <p>
          {t.source}:{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            github.com/f-pd/quotez
          </a>
        </p>

        <aside className="about-ai" data-testid="about-ai-disclaimer">
          <h2>{t.aiTitle}</h2>
          <p>{t.ai}</p>
        </aside>

        <p className="about-back">
          {urlLocale ? (
            <Link to="/$locale" params={{ locale: urlLocale }}>
              ← {t.back}
            </Link>
          ) : (
            <Link to="/">← {t.back}</Link>
          )}
        </p>
      </article>
    </div>
  );
}
