import { useNavigate, useParams } from '@tanstack/solid-router';
import { QuoteDisplay } from '../components/QuoteDisplay';
import { canonicalLocale } from '../lib/i18n';

export function PublicPage() {
  const params = useParams({ strict: false }) as () => { locale?: string };
  const navigate = useNavigate();
  const urlLocale = () => {
    const l = params().locale;
    return l ? canonicalLocale(l) : null;
  };

  return (
    <QuoteDisplay
      urlLocale={urlLocale()}
      onLocaleChange={(locale) => navigate({ to: '/$locale', params: { locale } })}
    />
  );
}
