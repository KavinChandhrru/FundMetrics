import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, StopCircle, Loader2, Trophy } from 'lucide-react';
import type { SchemeListItem, RankingEntry } from '../../types/fund';
import { fetchSchemeList, fetchFundDetails, concurrentFetch } from '../../services/api';
import { periodReturn, solveXirr, fmtPct } from '../../utils/financialMath';
import { cn } from '../../lib/utils';

const HORIZONS = [
  { label: '1Y',  days: 365,  years: 1  },
  { label: '3Y',  days: 1095, years: 3  },
  { label: '5Y',  days: 1825, years: 5  },
  { label: '7Y',  days: 2555, years: 7  },
  { label: '10Y', days: 3650, years: 10 },
];

const CATEGORIES = [
  'All',
  'Equity',
  'Debt',
  'Hybrid',
  'Index',
  'ELSS',
  'Sectoral',
];

function RankingRow({ rank, entry, onOpen }: { rank: number; entry: RankingEntry; onOpen: () => void }) {
  return (
    <tr
      className="cursor-pointer border-b border-border transition-colors hover:bg-muted/40"
      onClick={onOpen}
    >
      <td className="px-3 py-2 text-sm font-semibold text-muted-foreground">{rank}</td>
      <td className="px-3 py-2 text-sm leading-snug">{entry.schemeName}</td>
      <td className={cn('px-3 py-2 text-right text-sm font-bold tabular-nums', entry.sipXirrPct !== null && entry.sipXirrPct >= 0 ? 'text-pos' : 'text-neg')}>
        {fmtPct(entry.sipXirrPct, 2)}
      </td>
      <td className={cn('px-3 py-2 text-right text-sm font-bold tabular-nums', entry.lumpsumCagrPct !== null && entry.lumpsumCagrPct >= 0 ? 'text-pos' : 'text-neg')}>
        {fmtPct(entry.lumpsumCagrPct, 2)}
      </td>
    </tr>
  );
}

export function RankingsTab({ onFundSelect }: { onFundSelect: (scheme: SchemeListItem) => void }) {
  const [horizonIdx, setHorizonIdx] = useState(2); // default 5Y
  const [category, setCategory] = useState('All');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const selectedHorizon = HORIZONS[horizonIdx];

  const { data: allSchemes = [] } = useQuery({
    queryKey: ['schemes'],
    queryFn: fetchSchemeList,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Filter schemes by category keyword
  const filteredSchemes = category === 'All'
    ? allSchemes
    : allSchemes.filter(s => s.schemeName.toLowerCase().includes(category.toLowerCase()));

  const startRanking = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setProgress(0);
    setEntries([]);
    setTotal(filteredSchemes.length);

    const abort = new AbortController();
    abortRef.current = abort;

    let processed = 0;
    const localEntries: RankingEntry[] = [];

    await concurrentFetch(
      filteredSchemes,
      async (scheme) => {
        const details = await fetchFundDetails(scheme.schemeCode);
        return { scheme, details };
      },
      20, // max 20 concurrent requests — fixes the audit's 2000-parallel issue
      (result) => {
        processed++;
        setProgress(processed);

        if (!result) return;
        const { scheme, details } = result;
        const navData = details.data;

        // Lumpsum CAGR
        const lumpsumCagrPct = periodReturn(navData, selectedHorizon.days);

        // SIP XIRR — build monthly cashflows over the horizon
        const endPoint = navData[navData.length - 1];
        const startDate = new Date(endPoint.date.getTime() - selectedHorizon.days * 86_400_000);
        const relevantNav = navData.filter(p => p.date >= startDate);
        let sipXirrPct: number | null = null;
        if (relevantNav.length >= 12) {
          const cashflows: { date: Date; amount: number }[] = [];
          let lastMonth = '';
          for (const point of relevantNav) {
            const monthKey = `${point.date.getFullYear()}-${point.date.getMonth()}`;
            if (monthKey !== lastMonth && point.nav > 0) {
              cashflows.push({ date: point.date, amount: -10_000 });
              lastMonth = monthKey;
            }
          }
          if (cashflows.length >= 2) {
            const finalValue = cashflows.length * 10_000 * (endPoint.nav / relevantNav[0].nav);
            sipXirrPct = solveXirr([...cashflows, { date: endPoint.date, amount: finalValue }]);
          }
        }

        if (lumpsumCagrPct !== null || sipXirrPct !== null) {
          localEntries.push({ schemeCode: scheme.schemeCode, schemeName: scheme.schemeName, sipXirrPct, lumpsumCagrPct });
          // Update top 20 every 50 processed
          if (processed % 50 === 0 || processed === filteredSchemes.length) {
            const sorted = [...localEntries].sort((a, b) =>
              (b.lumpsumCagrPct ?? -Infinity) - (a.lumpsumCagrPct ?? -Infinity)
            );
            setEntries(sorted.slice(0, 20));
          }
        }
      },
      abort.signal,
    );

    // Final sort
    const sorted = [...localEntries].sort((a, b) =>
      (b.lumpsumCagrPct ?? -Infinity) - (a.lumpsumCagrPct ?? -Infinity)
    );
    setEntries(sorted.slice(0, 20));
    setIsRunning(false);
  }, [filteredSchemes, isRunning, selectedHorizon]);

  const stopRanking = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  // Stop on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Horizon:</span>
          {HORIZONS.map((h, i) => (
            <button
              key={h.label}
              onClick={() => setHorizonIdx(i)}
              disabled={isRunning}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                i === horizonIdx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Category:</span>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            disabled={isRunning}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        {!isRunning ? (
          <button
            onClick={startRanking}
            disabled={allSchemes.length === 0}
            className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <TrendingUp className="h-4 w-4" />
            Rank {filteredSchemes.length.toLocaleString()} funds
          </button>
        ) : (
          <button
            onClick={stopRanking}
            className="ml-auto flex items-center gap-2 rounded-lg bg-neg px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <StopCircle className="h-4 w-4" />
            Stop
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analysed {progress.toLocaleString()} / {total.toLocaleString()} funds
            (max 20 concurrent requests)
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: total > 0 ? `${(progress / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Results table */}
      {entries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-elegant">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">
              Top {entries.length} funds by {selectedHorizon.label} Lumpsum CAGR
            </span>
            {isRunning && <span className="ml-auto text-xs text-muted-foreground">Updating…</span>}
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Fund</th>
                <th className="px-3 py-2 text-right">SIP XIRR</th>
                <th className="px-3 py-2 text-right">Lump CAGR</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <RankingRow
                  key={entry.schemeCode}
                  rank={i + 1}
                  entry={entry}
                  onOpen={() => onFundSelect({ schemeCode: entry.schemeCode, schemeName: entry.schemeName })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isRunning && entries.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Click "Rank funds" to start. Results appear progressively as funds are analysed.<br />
          <span className="text-xs">Uses 20 concurrent requests to avoid browser/API overload.</span>
        </div>
      )}
    </div>
  );
}
