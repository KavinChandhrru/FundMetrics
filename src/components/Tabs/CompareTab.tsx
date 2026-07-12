import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQueries } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import type { FundDetails, SchemeListItem } from '../../types/fund';
import { fetchFundDetails } from '../../services/api';
import {
  calcRiskMetrics,
  fmtPct, fmtDate,
} from '../../utils/financialMath';
import { FundSearchBar } from '../Search/FundSearchBar';
import { cn } from '../../lib/utils';

const RF_RATE = 6.5;
const COLORS = [
  'hsl(var(--primary))',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
];
const MAX_FUNDS = 4;

export function CompareTab({ primaryFund }: { primaryFund: FundDetails }) {
  const [extraSchemes, setExtraSchemes] = useState<SchemeListItem[]>([]);

  const allSchemes: SchemeListItem[] = [
    { schemeCode: primaryFund.meta.scheme_code, schemeName: primaryFund.meta.scheme_name },
    ...extraSchemes,
  ];

  // useQueries is the correct hook for a dynamic list of queries (no rules-of-hooks violation)
  const extraQueries = useQueries({
    queries: extraSchemes.map(s => ({
      queryKey: ['scheme', s.schemeCode],
      queryFn: () => fetchFundDetails(s.schemeCode),
      staleTime: 60 * 60 * 1000,
    })),
  });

  function addFund(scheme: SchemeListItem) {
    if (allSchemes.some(s => s.schemeCode === scheme.schemeCode)) return;
    if (allSchemes.length >= MAX_FUNDS) return;
    setExtraSchemes(prev => [...prev, scheme]);
  }

  function removeFund(code: number) {
    setExtraSchemes(prev => prev.filter(s => s.schemeCode !== code));
  }

  // Build rebased chart data using all loaded fund data
  const rebasedChartData = useMemo(() => {
    const allData: { data: FundDetails['data']; name: string }[] = [
      { data: primaryFund.data, name: primaryFund.meta.scheme_name.slice(0, 22) },
      ...extraQueries
        .map((q, i) => ({
          data: q.data?.data ?? [],
          name: extraSchemes[i]?.schemeName.slice(0, 22) ?? '',
        }))
        .filter(d => d.data.length > 0),
    ];

    if (allData.length === 0) return [];

    // Common start = latest of all fund start dates
    const commonStart = allData.reduce((latest, fd) => {
      const start = fd.data[0]?.date;
      return start && start > latest ? start : latest;
    }, new Date(0));

    const baseData = allData[0].data.filter(p => p.date >= commonStart);
    const step = Math.max(1, Math.floor(baseData.length / 300));

    return baseData
      .filter((_, i) => i % step === 0 || i === baseData.length - 1)
      .map(point => {
        const entry: Record<string, string | number> = { date: fmtDate(point.date) };
        for (const fd of allData) {
          const startPoint = fd.data.find(p => p.date >= commonStart);
          const closest = fd.data.find(p => p.date >= point.date);
          if (startPoint && closest && startPoint.nav > 0) {
            entry[fd.name] = parseFloat(((closest.nav / startPoint.nav) * 100).toFixed(2));
          }
        }
        return entry;
      });
  }, [primaryFund, extraQueries, extraSchemes]);

  const fundDisplayInfo = allSchemes.map((s, i) => ({
    name: s.schemeName.slice(0, 22),
    color: COLORS[i] ?? '#999',
    scheme: s,
  }));

  // Compute risk metrics for primary fund
  const primaryMetrics = useMemo(() => calcRiskMetrics(primaryFund.data, RF_RATE), [primaryFund]);

  return (
    <div className="space-y-6">
      {/* Add fund search */}
      {allSchemes.length < MAX_FUNDS && (
        <div className="flex items-center gap-3">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <FundSearchBar onSelect={addFund} placeholder="Add a fund to compare…" />
          </div>
        </div>
      )}
      {allSchemes.length >= MAX_FUNDS && (
        <p className="text-xs text-muted-foreground">Maximum {MAX_FUNDS} funds for comparison.</p>
      )}

      {/* Rebased NAV chart */}
      {rebasedChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
          <h3 className="mb-3 text-sm font-semibold">Rebased NAV (Base = 100 at common start)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rebasedChartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}`, '']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {fundDisplayInfo.map(fn => (
                <Line
                  key={fn.name}
                  type="monotone"
                  dataKey={fn.name}
                  stroke={fn.color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Risk metrics table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-elegant">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Fund</th>
              <th className="px-3 py-2 text-right">Sharpe</th>
              <th className="px-3 py-2 text-right">Sortino</th>
              <th className="px-3 py-2 text-right">Max DD</th>
              <th className="px-3 py-2 text-right">Volatility</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {/* Primary fund */}
            <tr className="border-b border-border bg-muted/10">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[0] }} />
                  <span className="text-sm font-medium">{primaryFund.meta.scheme_name.slice(0, 40)}</span>
                  <span className="text-[10px] text-muted-foreground">(current)</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{primaryMetrics.sharpe?.toFixed(2) ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{primaryMetrics.sortino?.toFixed(2) ?? '—'}</td>
              <td className={cn('px-3 py-2 text-right tabular-nums', primaryMetrics.maxDrawdownPct < -20 ? 'text-neg' : '')}>
                {fmtPct(primaryMetrics.maxDrawdownPct, 1)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtPct(primaryMetrics.annualisedVolatilityPct, 1)}</td>
              <td className="px-3 py-2" />
            </tr>

            {/* Extra funds */}
            {extraSchemes.map((scheme, i) => {
              const q = extraQueries[i];
              const metrics = q.data ? calcRiskMetrics(q.data.data, RF_RATE) : null;
              return (
                <tr key={scheme.schemeCode} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i + 1] ?? '#999' }} />
                      <span className="text-sm">{scheme.schemeName.slice(0, 40)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{q.isLoading ? '…' : metrics?.sharpe?.toFixed(2) ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{q.isLoading ? '…' : metrics?.sortino?.toFixed(2) ?? '—'}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', metrics && metrics.maxDrawdownPct < -20 ? 'text-neg' : '')}>
                    {q.isLoading ? '…' : fmtPct(metrics?.maxDrawdownPct ?? null, 1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{q.isLoading ? '…' : fmtPct(metrics?.annualisedVolatilityPct ?? null, 1)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeFund(scheme.schemeCode)} aria-label="Remove fund" className="text-muted-foreground hover:text-neg">
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Sharpe and Sortino use a {RF_RATE}% risk-free rate with geometric daily conversion and sample standard deviation.
      </p>
    </div>
  );
}
