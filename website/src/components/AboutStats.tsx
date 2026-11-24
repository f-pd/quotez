import { For, Show, createResource } from 'solid-js';
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
export function AboutStats(props: { t: AboutText; locale: string }) {
  const [stats] = createResource<Stats | 'missing'>(() =>
    fetch('/stats.json')
      .then((r) => (r.ok ? r.json() : 'missing'))
      .catch(() => 'missing')
      .then((s) => (s?.updated_at ? (s as Stats) : 'missing')),
  );

  const num = (n: number) => n.toLocaleString(props.locale);
  const t = () => props.t;

  return (
    <Show when={stats()}>
      {(s) => (
        <section class="about-stats" data-testid="about-stats">
          <h2>{t().numbersTitle}</h2>
          <Show when={s() !== 'missing' ? (s() as Stats) : null} fallback={<p>{t().noData}</p>}>
            {(st) => (
              <>
                <p>
                  {t().numbersIntro(
                    new Date(st().updated_at).toLocaleString(props.locale, { dateStyle: 'long', timeStyle: 'short' }),
                    st().commit.slice(0, 7),
                  )}
                </p>

                <Show when={st().image?.registry || st().image?.local}>
                  <h3>{t().imageTitle}</h3>
                  <ul>
                    <For each={st().image?.registry?.platforms ?? []}>
                      {(p) => <li>{t().imageCompressed(formatBytes(p.compressed_bytes, props.locale), p.platform)}</li>}
                    </For>
                    <Show when={st().image?.local}>
                      {(local) => <li>{t().imageLocal(formatBytes(local().binary_bytes, props.locale))}</li>}
                    </Show>
                  </ul>
                </Show>

                <Show when={st().load_test}>
                  {(lt) => (
                    <>
                      <h3>{t().loadTitle}</h3>
                      <p>{t().loadIntro(lt().host.cpu, lt().host.cores, lt().criteria.p95_limit_ms, lt().criteria.step_duration)}</p>
                      <div class="about-table-wrap">
                        <table class="about-table">
                          <thead>
                            <tr>
                              <th>{t().colLimits}</th>
                              <th>{t().colHolds}</th>
                              <th>{t().colSuffers}</th>
                              <th>{t().colMemory}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={lt().profiles}>
                              {(p) => (
                                <tr>
                                  <td>
                                    {num(p.cpus)} vCPU · {formatMemoryLimit(p.memory)}
                                  </td>
                                  <td>{p.max_healthy_rate > 0 ? t().perSecond(num(p.max_healthy_rate)) : '—'}</td>
                                  <td>
                                    <Show when={p.suffering} fallback={t().notReached}>
                                      {(suf) => (
                                        <>
                                          {t().perSecond(num(suf().rate))}
                                          <span class="about-reason">{t().reason(suf().kind, suf().value)}</span>
                                        </>
                                      )}
                                    </Show>
                                  </td>
                                  <td>{p.levels[p.levels.length - 1]?.memory_after ?? '—'}</td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Show>

                <Show when={st().production}>
                  {(prod) => (
                    <>
                      <h3>{t().prodTitle}</h3>
                      <p>
                        {t().prod(
                          prod().target_rate,
                          Math.round(prod().duration_s),
                          prod().target,
                          formatPercent(prod().ok_rate, props.locale),
                          formatMs(prod().latency_ms.p50, props.locale),
                          formatMs(prod().latency_ms.p95, props.locale),
                        )}
                      </p>
                    </>
                  )}
                </Show>
              </>
            )}
          </Show>
        </section>
      )}
    </Show>
  );
}
