import { useEffect, useState } from 'react';
import type { AboutText } from '../lib/about';

/** stats.json as published by CI (see .github/workflows/ci.yml, publish-stats) */
type Level = {
  target_rate: number;
  achieved_rate: number;
  ok_rate: number;
  latency_ms: { p50: number; p95: number };
  memory_after?: string;
};

type Profile = {
  name: string;
  cpus: number;
  memory: string;
  max_healthy_rate: number;
  suffering: { rate: number; kind: string; value: number | null } | null;
  levels: Level[];
};

type Stats = {
  updated_at: string;
  commit: string;
  image?: {
    local?: { platform: string; uncompressed_bytes: number; binary_bytes: number } | null;
    registry?: { platforms: { platform: string; compressed_bytes: number }[] } | null;
  };
  load_test?: {
    host: { cpu: string; cores: number };
    criteria: { step_duration: string; p95_limit_ms: number };
    profiles: Profile[];
  } | null;
  production?: {
    target: string;
    target_rate: number;
    duration_s: number;
    ok_rate: number;
    latency_ms: { p50: number; p95: number };
  } | null;
};

function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 2 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${units[unit]}`;
}

function formatMs(ms: number, locale: string): string {
  return `${ms.toLocaleString(locale, { maximumFractionDigits: ms < 10 ? 1 : 0 })} ms`;
}

function formatPercent(rate: number, locale: string): string {
  return rate.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 });
}

/** "64m" -> "64 MB" */
function formatMemoryLimit(mem: string): string {
  const m = /^(\d+(?:\.\d+)?)([kmg])$/i.exec(mem.trim());
  if (!m) return mem;
  return `${m[1]} ${{ k: 'KB', m: 'MB', g: 'GB' }[m[2]!.toLowerCase() as 'k' | 'm' | 'g']}`;
}

/** The "Measured numbers" section of the About page */
export function AboutStats({ t, locale }: { t: AboutText; locale: string }) {
  const [stats, setStats] = useState<Stats | null | 'missing'>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/stats.json')
      .then((r) => (r.ok ? r.json() : 'missing'))
      .catch(() => 'missing')
      .then((s) => {
        if (!cancelled) setStats(s?.updated_at ? (s as Stats) : 'missing');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (stats === null) return null;

  const num = (n: number) => n.toLocaleString(locale);

  return (
    <section className="about-stats" data-testid="about-stats">
      <h2>{t.numbersTitle}</h2>
      {stats === 'missing' ? (
        <p>{t.noData}</p>
      ) : (
        <>
          <p>
            {t.numbersIntro(
              new Date(stats.updated_at).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }),
              stats.commit.slice(0, 7),
            )}
          </p>

          {(stats.image?.registry || stats.image?.local) && (
            <>
              <h3>{t.imageTitle}</h3>
              <ul>
                {stats.image.registry?.platforms.map((p) => (
                  <li key={p.platform}>{t.imageCompressed(formatBytes(p.compressed_bytes, locale), p.platform)}</li>
                ))}
                {stats.image.local && (
                  <li>
                    {t.imageLocal(formatBytes(stats.image.local.binary_bytes, locale))}
                  </li>
                )}
              </ul>
            </>
          )}

          {stats.load_test && (
            <>
              <h3>{t.loadTitle}</h3>
              <p>
                {t.loadIntro(
                  stats.load_test.host.cpu,
                  stats.load_test.host.cores,
                  stats.load_test.criteria.p95_limit_ms,
                  stats.load_test.criteria.step_duration,
                )}
              </p>
              <div className="about-table-wrap">
                <table className="about-table">
                  <thead>
                    <tr>
                      <th>{t.colLimits}</th>
                      <th>{t.colHolds}</th>
                      <th>{t.colSuffers}</th>
                      <th>{t.colMemory}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.load_test.profiles.map((p) => {
                      const last = p.levels[p.levels.length - 1];
                      return (
                        <tr key={p.name}>
                          <td>
                            {num(p.cpus)} vCPU · {formatMemoryLimit(p.memory)}
                          </td>
                          <td>{p.max_healthy_rate > 0 ? t.perSecond(num(p.max_healthy_rate)) : '—'}</td>
                          <td>
                            {p.suffering ? (
                              <>
                                {t.perSecond(num(p.suffering.rate))}
                                <span className="about-reason">
                                  {t.reason(p.suffering.kind, p.suffering.value)}
                                </span>
                              </>
                            ) : (
                              t.notReached
                            )}
                          </td>
                          <td>{last?.memory_after ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {stats.production && (
            <>
              <h3>{t.prodTitle}</h3>
              <p>
                {t.prod(
                  stats.production.target_rate,
                  Math.round(stats.production.duration_s),
                  stats.production.target,
                  formatPercent(stats.production.ok_rate, locale),
                  formatMs(stats.production.latency_ms.p50, locale),
                  formatMs(stats.production.latency_ms.p95, locale),
                )}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
