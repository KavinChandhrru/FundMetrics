/**
 * api.ts — FundMetrics API Service
 *
 * Fixes from audit:
 *  - All responses are fully typed (no `any`)
 *  - AbortController + 10-second timeout on every request
 *  - HTTP status codes surfaced in errors
 *  - `parseNavData()` parses DD-MM-YYYY, filters NaN/negative, sorts ascending
 *  - `concurrentFetch()` rate-limits to 20 parallel requests (rankings safety)
 */

import type { FundDetails, NavPoint, SchemeListItem } from '../types/fund';
import { DAY_MS } from '../utils/financialMath';

const MF_API_BASE = 'https://api.mfapi.in';

// ---------------------------------------------------------------------------
// Request utility with timeout
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse "DD-MM-YYYY" date strings from the mfapi.in response.
 * Using explicit field splitting avoids timezone issues that afflict
 * `new Date(string)` when the string is ambiguous.
 */
export function parseApiDate(dateStr: string): Date {
  const [dd, mm, yyyy] = dateStr.split('-').map(Number);
  // Month is 0-indexed in JS Date
  return new Date(yyyy, mm - 1, dd);
}

// ---------------------------------------------------------------------------
// NAV data parsing + normalisation
// ---------------------------------------------------------------------------

interface RawNavPoint {
  date: string;
  nav: string;
}

/**
 * Parse the raw API NAV array into typed NavPoint[]:
 *  - Parses dates from "DD-MM-YYYY"
 *  - Converts NAV strings to numbers
 *  - Filters out NaN and zero/negative values
 *  - Sorts ascending by date (API returns newest-first)
 */
export function parseNavData(raw: RawNavPoint[]): NavPoint[] {
  return (raw ?? [])
    .map(r => ({ date: parseApiDate(r.date), nav: parseFloat(r.nav) }))
    .filter(p => !isNaN(p.nav) && p.nav > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------------------------------------------------------------------------
// Scheme List (all funds)
// ---------------------------------------------------------------------------

interface RawSchemeListItem {
  schemeCode: number;
  schemeName: string;
}

/**
 * Fetch the complete list of mutual fund schemes (~5000 schemes).
 * Cached indefinitely in React Query — only fetched once per session.
 */
export async function fetchSchemeList(): Promise<SchemeListItem[]> {
  const res = await fetchWithTimeout(`${MF_API_BASE}/mf`);
  if (!res.ok) {
    throw new Error(`Failed to load scheme list (HTTP ${res.status})`);
  }
  const data: RawSchemeListItem[] = await res.json();
  return data.map(s => ({ schemeCode: s.schemeCode, schemeName: s.schemeName }));
}

// ---------------------------------------------------------------------------
// Single Fund Details
// ---------------------------------------------------------------------------

interface RawFundDetails {
  meta: {
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_code: number;
    scheme_name: string;
  };
  data: RawNavPoint[];
  status: string;
}

/**
 * Fetch full NAV history for a single scheme.
 * NAV data is parsed, filtered, and sorted ascending.
 */
export async function fetchFundDetails(schemeCode: number | string): Promise<FundDetails> {
  const res = await fetchWithTimeout(`${MF_API_BASE}/mf/${schemeCode}`);
  if (!res.ok) {
    throw new Error(`Failed to load scheme ${schemeCode} (HTTP ${res.status})`);
  }
  const raw: RawFundDetails = await res.json();
  return {
    meta: raw.meta,
    data: parseNavData(raw.data),
  };
}

// ---------------------------------------------------------------------------
// Rate-limited concurrent fetcher (for Rankings tab)
// ---------------------------------------------------------------------------

/**
 * Fetch multiple items concurrently with a max concurrency limit.
 *
 * Fixes the critical audit issue where 2000+ parallel fetch requests
 * were fired simultaneously for the Rankings tab, risking browser crashes
 * and API-level IP throttling.
 *
 * @param items        Array of items to process
 * @param fn           Async function to call per item
 * @param concurrency  Max parallel in-flight requests (default: 20)
 * @param onResult     Optional callback called immediately as each result arrives
 * @param signal       Optional AbortSignal to cancel the batch early
 */
export async function concurrentFetch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 20,
  onResult?: (result: R, item: T, index: number) => void,
  signal?: AbortSignal,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (signal?.aborted) break;
      const index = nextIndex++;
      try {
        const result = await fn(items[index]);
        results[index] = result;
        onResult?.(result, items[index], index);
      } catch {
        // Individual failures don't stop the batch
        results[index] = null;
      }
    }
  }

  // Spin up `concurrency` workers that share the index counter
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Search utility (local filter — no extra API calls)
// ---------------------------------------------------------------------------

/**
 * Filter a scheme list by a search query.
 * Case-insensitive substring match on scheme name.
 * Returns at most `limit` results.
 */
export function filterSchemes(
  schemes: SchemeListItem[],
  query: string,
  limit = 50,
): SchemeListItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SchemeListItem[] = [];
  for (const s of schemes) {
    if (s.schemeName.toLowerCase().includes(q)) {
      results.push(s);
      if (results.length >= limit) break;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Benchmark NAV proxy (Nifty 50 TRI scheme codes via mfapi)
// ---------------------------------------------------------------------------

/** Pre-defined benchmark proxies available in the Compare / Portfolio tabs */
export const BENCHMARKS: SchemeListItem[] = [
  { schemeCode: 120716, schemeName: 'Nifty 50 TRI (UTI Index Fund proxy)' },
  { schemeCode: 118834, schemeName: 'Nifty 500 TRI (Motilal proxy)' },
  { schemeCode: 145552, schemeName: 'Nifty Midcap 150 TRI (Motilal proxy)' },
];

// ---------------------------------------------------------------------------
// NAV age check
// ---------------------------------------------------------------------------

/**
 * Returns true if the latest NAV in the dataset is older than `maxAgeDays`
 * calendar days — used to warn users about stale data.
 */
export function isNavStale(navData: NavPoint[], maxAgeDays = 5): boolean {
  if (navData.length === 0) return true;
  const latest = navData[navData.length - 1].date;
  const ageDays = (Date.now() - latest.getTime()) / DAY_MS;
  return ageDays > maxAgeDays;
}
