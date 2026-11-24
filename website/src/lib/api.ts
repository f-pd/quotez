import { getAuthHeader } from './auth';

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const auth = getAuthHeader();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { 'Authorization': auth } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = `${data.error} (${res.status})`;
    } catch {
      /* body was not JSON */
    }
    throw new Error(message);
  }
  return res;
}

export type Quote = {
  id: number;
  text: string;
  /** Times served over TCP/UDP since start or last stats reset */
  served?: number;
  /** File the quote was loaded from; null when added through the API */
  source?: string | null;
  author?: string | null;
  /** Book, speech or work the quote comes from (fallback description) */
  work?: string | null;
  /** The source described per language: titles original, the rest localized */
  works?: Record<string, string>;
  tags?: string[];
  /** Original language as declared by the source; null = default locale assumed */
  lang?: string | null;
  /** Effective original language (lang or the default locale) */
  original_lang?: string;
  /** Language tag -> translated text */
  translations?: Record<string, string>;
};

/** Editable fields; on update, omitted fields keep their current value */
export type QuoteInput = {
  text?: string;
  author?: string | null;
  work?: string | null;
  /** Replaces all per-language source descriptions */
  works?: Record<string, string>;
  lang?: string | null;
  tags?: string[];
  translations?: Record<string, string>;
};

export type Status = {
  status: string;
  quotes: number;
  mode: string;
  uptime_seconds: number;
  polling_interval: number;
  maintenance?: boolean;
  debug?: boolean;
  served_total?: number;
};

export type Stats = {
  uptime_seconds: number;
  stats_window_seconds: number;
  quotes: number;
  mode: string;
  maintenance: boolean;
  debug: boolean;
  served: { total: number; tcp: number; udp: number; maintenance: number; empty: number };
  http: { requests: number; api_requests: number; auth_failures: number };
  reloads: number;
  last_served_seconds_ago: number | null;
  store: { files_parsed: number; quotes_loaded: number; duplicates_removed: number };
  /** Requests per minute for the last 60 minutes, oldest first */
  timeline_per_minute: number[];
  never_served: number;
  top: Array<{ id: number; served: number; text: string }>;
};

export type LogLine = { seq: number; ts: number; level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; message: string };
export type LogsResponse = { next_seq: number; debug: boolean; lines: LogLine[] };

export type Maintenance = { maintenance: boolean; message: string };

export async function fetchQuotes(): Promise<Quote[]> {
  const res = await apiFetch('/api/quotes');
  const data = await res.json();
  return data.quotes;
}

export async function createQuote(input: QuoteInput | string): Promise<Quote> {
  const res = await apiFetch('/api/quotes', {
    method: 'POST',
    body: JSON.stringify(typeof input === 'string' ? { text: input } : input),
  });
  return res.json();
}

export async function updateQuote(id: number, input: QuoteInput | string): Promise<Quote> {
  const res = await apiFetch(`/api/quotes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(typeof input === 'string' ? { text: input } : input),
  });
  return res.json();
}

export async function fetchLocales(): Promise<{ supported: string[]; default: string }> {
  const res = await fetch('/locales?format=json');
  if (!res.ok) return { supported: ['en', 'it', 'fr'], default: 'en' };
  return res.json();
}

export async function deleteQuote(id: number): Promise<void> {
  await apiFetch(`/api/quotes/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchStatus(): Promise<Status> {
  const res = await apiFetch('/api/status');
  return res.json();
}

export async function fetchStats(top = 10): Promise<Stats> {
  const res = await apiFetch(`/api/stats?top=${top}`);
  return res.json();
}

export async function resetStats(): Promise<void> {
  await apiFetch('/api/stats/reset', { method: 'POST' });
}

export async function fetchLogs(params: { since?: number; limit?: number; level?: string } = {}): Promise<LogsResponse> {
  const q = new URLSearchParams();
  if (params.since !== undefined) q.set('since', String(params.since));
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.level) q.set('level', params.level);
  const res = await apiFetch(`/api/logs?${q.toString()}`);
  return res.json();
}

export async function fetchConfig(): Promise<{selection_mode: string, polling_interval: number, directories: string[]}> {
  const res = await apiFetch('/api/config');
  return res.json();
}

export async function updateConfig(changes: {selection_mode?: string, polling_interval?: number}): Promise<void> {
  await apiFetch('/api/config', {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

export async function triggerReload(): Promise<{status: string, quotes: number}> {
  const res = await apiFetch('/api/reload', {
    method: 'POST',
  });
  return res.json();
}

export async function fetchMaintenance(): Promise<Maintenance> {
  const res = await apiFetch('/api/maintenance');
  return res.json();
}

export async function setMaintenance(changes: { enabled?: boolean; message?: string }): Promise<Maintenance> {
  const res = await apiFetch('/api/maintenance', {
    method: 'POST',
    body: JSON.stringify(changes),
  });
  return res.json();
}

/** @deprecated use setMaintenance */
export async function toggleMaintenance(enabled: boolean): Promise<void> {
  await setMaintenance({ enabled });
}

export async function fetchDebug(): Promise<{ debug: boolean }> {
  const res = await apiFetch('/api/debug');
  return res.json();
}

export async function setDebug(enabled: boolean): Promise<{ debug: boolean }> {
  const res = await apiFetch('/api/debug', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}
