import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { FundDetails } from '../../types/fund';
import { calcAnnualReturns, fmtPct } from '../../utils/financialMath';
import { cn } from '../../lib/utils';

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { year: number; returnPct: number; volatilityPct: number; incomplete: boolean } }>;
}

function AnnualTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-elegant">
      <p className="font-semibold">{d.year}{d.incomplete ? ' (partial)' : ''}</p>
      <p className={cn('font-bold', d.returnPct >= 0 ? 'text-pos' : 'text-neg')}>
        Return: {fmtPct(d.returnPct, 2)}
      </p>
      <p className="text-muted-foreground">Volatility: {fmtPct(d.volatilityPct, 1)}</p>
    </div>
  );
}

export function AnnualTab({ fundData }: { fundData: FundDetails }) {
  const { data } = fundData;

  const annualReturns = useMemo(() => calcAnnualReturns(data), [data]);

  const positiveYears = annualReturns.filter(y => !y.incomplete && y.returnPct >= 0).length;
  const negativeYears = annualReturns.filter(y => !y.incomplete && y.returnPct < 0).length;
  const totalComplete = positiveYears + negativeYears;

  if (annualReturns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Not enough NAV history to compute annual returns.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
        <h3 className="mb-3 text-sm font-semibold">Calendar Year Returns</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={annualReturns} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} />
            <YAxis
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<AnnualTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
            <Bar dataKey="returnPct" radius={[3, 3, 0, 0]}>
              {annualReturns.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.returnPct >= 0 ? 'hsl(var(--pos))' : 'hsl(var(--neg))'}
                  opacity={entry.incomplete ? 0.5 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-elegant text-sm">
        <p className="text-muted-foreground">
          <span className="font-semibold text-pos">{positiveYears}</span> positive years ·{' '}
          <span className="font-semibold text-neg">{negativeYears}</span> negative years
          {totalComplete > 0 && (
            <>
              {' '}· <span className="font-semibold">{((positiveYears / totalComplete) * 100).toFixed(0)}%</span> hit rate
            </>
          )}
        </p>
      </div>

      {/* Data table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-elegant">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">Year</th>
              <th className="px-4 py-2 text-right">Return</th>
              <th className="px-4 py-2 text-right">Volatility (Ann.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...annualReturns].reverse().map(row => (
              <tr key={row.year} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">
                  {row.year}
                  {row.incomplete && (
                    <span className="ml-2 text-[10px] text-amber-500">partial</span>
                  )}
                </td>
                <td className={cn('px-4 py-2 text-right font-bold tabular-nums', row.returnPct >= 0 ? 'text-pos' : 'text-neg')}>
                  {fmtPct(row.returnPct, 2)}
                </td>
                <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                  {fmtPct(row.volatilityPct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
