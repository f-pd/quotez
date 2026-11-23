import { useNavigate, useParams } from '@tanstack/react-router';
import { QuoteDisplay } from '../components/QuoteDisplay';
import { canonicalLocale } from '../lib/i18n';

export function PublicPage() {
  const params = useParams({ strict: false }) as { locale?: string };
  const navigate = useNavigate();
  const urlLocale = params.locale ? canonicalLocale(params.locale) : null;

  return (
    <QuoteDisplay
      urlLocale={urlLocale}
      onLocaleChange={(locale) => navigate({ to: '/$locale', params: { locale } })}
    />
  );
}
