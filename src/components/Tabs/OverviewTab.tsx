import React, { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { FundDetails } from '../../types/fund';
import { PERIODS, type PeriodDef } from '../../types/fund';
import {
  periodReturn, ytdReturn, inceptionReturn,
  fmtPct, fmtNAV, fmtDate,
  calcMaxDrawdown, calcSharpe,
  yearsBetween,
} from '../../utils/financialMath';
import { MetricCard } from '../ui/MetricCard';
import { cn } from '../../lib/utils';

const RF_RATE = 6.5; // default risk-free rate %
const DAY_MS = 86_400_000;

function sentimentFor(v: number | null): 'pos' | 'neg' | 'neutral' {
  if (v === null) return 'neutral';
  return v >= 0 ? 'pos' : 'neg';
}

function periodReturnFor(navData: FundDetails['data'], p: PeriodDef): number | null {
  if (p.kind === 'ytd') return ytdReturn(navData);
  if (p.kind === 'inception') return inceptionReturn(navData);
  if (p.days) return periodReturn(navData, p.days);
  return null;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function NavTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-elegant text-sm">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold">₹{payload[0].value.toFixed(4)}</p>
    </div>
  );
}

export function OverviewTab({ fundData }: { fundData: FundDetails }) {
  const [logScale, setLogScale] = useState(false);

  const { meta, data } = fundData;
  const latestNav = data[data.length - 1];
  const isStale = data.length > 0 &&
    (Date.now() - latestNav.date.getTime()) / DAY_MS > 5;

  // Build chart data (sample every 7th point for performance if large)
  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(data.length / 500));
    return data
      .filter((_, i) => i % step === 0 || i === data.length - 1)
      .map(p => ({
        date: fmtDate(p.date),
        nav: parseFloat(p.nav.toFixed(4)),
      }));
  }, [data]);

  const maxDrawdown = useMemo(() => calcMaxDrawdown(data), [data]);
  const volatility  = useMemo(() => calcVolatility(data),  [data]);
  const sharpe      = useMemo(() => calcSharpe(data, RF_RATE), [data]);
  const inceptionYears = useMemo(() =>
    data.length > 1 ? yearsBetween(data[0].date, latestNav.date) : 0, [data, latestNav]);

  return (
    <div className="space-y-6">
      {/* Fund header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold leading-tight">{meta.scheme_name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.scheme_category} · {meta.fund_house}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Code #{meta.scheme_code}
          </p>
        </div>
        {isStale && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            NAV may be stale
          </span>
        )}
      </div>

      {/* Current NAV + quick stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Current NAV"
          value={fmtNAV(latestNav.nav)}
          subLabel={`As of ${fmtDate(latestNav.date)}`}
          size="lg"
        />
        <MetricCard
          label="Inception"
          value={fmtDate(data[0].date)}
          subLabel={`${inceptionYears.toFixed(1)} years of history`}
        />
        <MetricCard
          label="Max Drawdown"
          value={fmtPct(maxDrawdown)}
          sentiment={sentimentFor(maxDrawdown)}
          subLabel="Peak to trough"
        />
        <MetricCard
          label={`Sharpe (RF ${RF_RATE}%)`}
          value={sharpe !== null ? sharpe.toFixed(2) : null}
          sentiment={sharpe !== null ? (sharpe > 1 ? 'pos' : sharpe > 0 ? 'neutral' : 'neg') : 'neutral'}
          subLabel="Annualised"
        />
      </div>

      {/* NAV Chart */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">NAV History</h3>
          <button
            onClick={() => setLogScale(l => !l)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              logScale ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {logScale ? 'Log scale' : 'Linear scale'}
          </button>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              scale={logScale ? 'log' : 'auto'}
              domain={logScale ? ['auto', 'auto'] : [0, 'auto']}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              width={60}
              tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}`}
            />
            <Tooltip content={<NavTooltip />} />
            <Area
              type="monotone"
              dataKey="nav"
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              fill="url(#navGrad)"
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Period returns grid */}
      <div>
        <h3 className="mb-3 text-sm font-semibold">Period Returns</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {PERIODS.map(p => {
            const ret = periodReturnFor(data, p);
            return (
              <div
                key={p.key}
                className="rounded-lg border border-border bg-card p-2.5 text-center shadow-elegant"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {p.label}
                </p>
                <p
                  className={cn(
                    'mt-1 text-sm font-bold tabular-nums',
                    ret === null && 'text-muted-foreground',
                    ret !== null && ret >= 0 && 'text-pos',
                    ret !== null && ret < 0  && 'text-neg',
                  )}
                >
                  {ret !== null ? fmtPct(ret, 1) : '—'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        All analytics are computed from historical NAVs and are for educational/analytical purposes
        only — not investment advice.
      </p>
    </div>
  );
}
