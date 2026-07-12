import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useQueries } from '@tanstack/react-query';
import { Plus, X, AlertTriangle } from 'lucide-react';
import type { FundDetails, PortfolioFund, SchemeListItem } from '../../types/fund';
import { fetchFundDetails } from '../../services/api';
import { fmtDate, fmtPct } from '../../utils/financialMath';
import { FundSearchBar } from '../Search/FundSearchBar';
import { cn } from '../../lib/utils';

const STORAGE_KEY = 'fm-portfolio-v1';
const MAX_FUNDS = 10;

function loadPortfolio(): PortfolioFund[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePortfolio(funds: PortfolioFund[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(funds)); } catch {}
}

export function PortfolioTab({ primaryFund }: { primaryFund: FundDetails }) {
  const [funds, setFunds] = useState<PortfolioFund[]>(() => {
    const stored = loadPortfolio();
    if (!stored.find(f => f.schemeCode === primaryFund.meta.scheme_code)) {
      return [
        { schemeCode: primaryFund.meta.scheme_code, schemeName: primaryFund.meta.scheme_name, weightPct: 100 },
        ...stored,
      ];
    }
    return stored;
  });

  useEffect(() => savePortfolio(funds), [funds]);

  const totalWeight = funds.reduce((s, f) => s + f.weightPct, 0);
  const weightsValid = Math.abs(totalWeight - 100) < 0.01;

  // useQueries handles a dynamic list without hooks violations
  const queries = useQueries({
    queries: funds.map(f => ({
      queryKey: ['scheme', f.schemeCode],
      queryFn: () => fetchFundDetails(f.schemeCode),
      staleTime: 60 * 60 * 1000,
    })),
  });

  function addFund(scheme: SchemeListItem) {
    if (funds.find(f => f.schemeCode === scheme.schemeCode)) return;
    if (funds.length >= MAX_FUNDS) return;
    const remaining = Math.max(0, Math.round(100 - totalWeight));
    setFunds(prev => [...prev, { schemeCode: scheme.schemeCode, schemeName: scheme.schemeName, weightPct: remaining }]);
  }

  function removeFund(code: number) {
    if (funds.length <= 1) return;
    setFunds(prev => prev.filter(f => f.schemeCode !== code));
  }

  function setWeight(code: number, weight: number) {
    setFunds(prev => prev.map(f => f.schemeCode === code ? { ...f, weightPct: Math.max(0, Math.min(100, weight)) } : f));
  }

  // Build blended NAV chart
  const chartData = useMemo(() => {
    const allLoaded = queries.every(q => q.data);
    if (!allLoaded || !weightsValid) return [];

    const navArrays = queries.map((q, i) => ({
      data: q.data!.data,
      weight: funds[i].weightPct / 100,
    }));

    const commonStart = navArrays.reduce((latest, fd) => {
      const d = fd.data[0]?.date;
      return d && d > latest ? d : latest;
    }, new Date(0));

    const baseData = navArrays[0].data.filter(p => p.date >= commonStart);
    const step = Math.max(1, Math.floor(baseData.length / 300));

    return baseData
      .filter((_, i) => i % step === 0 || i === baseData.length - 1)
      .map(point => {
        let blendedValue = 0;
        for (const fd of navArrays) {
          const startPoint = fd.data.find(p => p.date >= commonStart);
          const closest = fd.data.find(p => p.date >= point.date);
          if (startPoint && closest && startPoint.nav > 0) {
            blendedValue += fd.weight * (closest.nav / startPoint.nav) * 100;
          }
        }
        return { date: fmtDate(point.date), portfolio: parseFloat(blendedValue.toFixed(2)) };
      });
  }, [queries, funds, weightsValid]);

  const portfolioReturn = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].portfolio;
    const last = chartData[chartData.length - 1].portfolio;
    if (!first || !last) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);

  return (
    <div className="space-y-6">
      {/* Fund allocation table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">Portfolio Allocation</span>
          <span className={cn('text-sm font-bold tabular-nums', weightsValid ? 'text-pos' : 'text-neg')}>
            {totalWeight.toFixed(1)}% / 100%
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Fund</th>
              <th className="px-3 py-2 text-right w-28">Weight (%)</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {funds.map(fund => (
              <tr key={fund.schemeCode} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 leading-snug">{fund.schemeName}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0} max={100} step={1}
                    value={fund.weightPct}
                    onChange={e => setWeight(fund.schemeCode, parseFloat(e.target.value) || 0)}
                    className="w-20 rounded-md border border-border bg-background px-2 py-0.5 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => removeFund(fund.schemeCode)}
                    aria-label="Remove fund"
                    className="text-muted-foreground hover:text-neg transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Weight validation warning */}
      {!weightsValid && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Weights must sum to exactly 100%. Currently at {totalWeight.toFixed(1)}%.
        </div>
      )}

      {/* Add fund */}
      {funds.length < MAX_FUNDS && (
        <div className="flex items-center gap-3">
          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <FundSearchBar onSelect={addFund} placeholder="Add fund to portfolio…" />
          </div>
        </div>
      )}

      {/* Blended NAV chart */}
      {weightsValid && chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Blended Portfolio NAV (Base = 100)</h3>
            {portfolioReturn !== null && (
              <span className={cn('text-sm font-bold tabular-nums', portfolioReturn >= 0 ? 'text-pos' : 'text-neg')}>
                {fmtPct(portfolioReturn, 2)} total
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => [v.toFixed(2), 'Portfolio Value']} />
              <Line type="monotone" dataKey="portfolio" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Waiting for data */}
      {weightsValid && queries.some(q => q.isLoading) && (
        <p className="animate-pulse text-center text-sm text-muted-foreground">
          Loading fund data for chart…
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Portfolio is saved locally in your browser. Blended NAV uses weighted daily returns with a common start date.
      </p>
    </div>
  );
}
