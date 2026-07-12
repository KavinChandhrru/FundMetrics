import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { FundDetails } from '../../types/fund';
import { calcRollingCagr, calcRollingStats, fmtPct, fmtDate } from '../../utils/financialMath';
import { MetricCard } from '../ui/MetricCard';
import { cn } from '../../lib/utils';

const WINDOWS = [
  { label: '1Y',  days: 365   },
  { label: '2Y',  days: 730   },
  { label: '3Y',  days: 1095  },
  { label: '5Y',  days: 1825  },
  { label: '7Y',  days: 2555  },
  { label: '10Y', days: 3650  },
  { label: '15Y', days: 5475  },
];

export function RollingTab({ fundData }: { fundData: FundDetails }) {
  const { data } = fundData;
  const [windowIdx, setWindowIdx] = useState(2); // default 3Y
  const selectedWindow = WINDOWS[windowIdx];

  const rollingPoints = useMemo(
    () => calcRollingCagr(data, selectedWindow.days),
    [data, selectedWindow.days],
  );

  const stats = useMemo(() => calcRollingStats(rollingPoints), [rollingPoints]);

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(rollingPoints.length / 400));
    return rollingPoints
      .filter((_, i) => i % step === 0 || i === rollingPoints.length - 1)
      .map(p => ({ date: fmtDate(p.date), cagr: parseFloat(p.cagrPct.toFixed(2)) }));
  }, [rollingPoints]);

  const hasSufficientData = rollingPoints.length >= 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Window:</span>
        {WINDOWS.map((w, i) => (
          <button
            key={w.label}
            onClick={() => setWindowIdx(i)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              i === windowIdx
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {!hasSufficientData ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Not enough NAV history to compute {selectedWindow.label} rolling returns.
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
            <MetricCard label="Average"    value={fmtPct(stats.avg,    1)} sentiment={stats.avg    !== null ? (stats.avg    >= 0 ? 'pos' : 'neg') : 'neutral'} />
            <MetricCard label="Median"     value={fmtPct(stats.median, 1)} sentiment={stats.median !== null ? (stats.median >= 0 ? 'pos' : 'neg') : 'neutral'} />
            <MetricCard label="Best"       value={fmtPct(stats.max,    1)} sentiment="pos" />
            <MetricCard label="Worst"      value={fmtPct(stats.min,    1)} sentiment="neg" />
            <MetricCard label="% Positive" value={stats.pctPositive !== null ? `${stats.pctPositive.toFixed(1)}%` : null} sentiment={stats.pctPositive !== null ? (stats.pctPositive >= 70 ? 'pos' : stats.pctPositive >= 50 ? 'neutral' : 'neg') : 'neutral'} />
          </div>

          {/* Rolling CAGR Chart */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
            <h3 className="mb-3 text-sm font-semibold">
              {selectedWindow.label} Rolling CAGR — {stats.count.toLocaleString()} data points
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} width={48} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'CAGR']} labelFormatter={l => `End: ${l}`} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
                <Line type="monotone" dataKey="cagr" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-muted-foreground">
            Each point shows the CAGR an investor would have earned if they had invested {selectedWindow.label} before that date.
          </p>
        </>
      )}
    </div>
  );
}
