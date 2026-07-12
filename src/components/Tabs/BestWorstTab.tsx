import { useMemo, useState } from 'react';
import type { FundDetails } from '../../types/fund';
import { calcBestWorst, fmtPct, fmtDate } from '../../utils/financialMath';
import { cn } from '../../lib/utils';

const WINDOWS = [
  { label: '1M',  days: 30   },
  { label: '3M',  days: 91   },
  { label: '6M',  days: 182  },
  { label: '1Y',  days: 365  },
  { label: '3Y',  days: 1095 },
  { label: '5Y',  days: 1825 },
];

function WindowTable({
  title,
  data,
  type,
}: {
  title: string;
  data: Array<{ pct: number; start: Date; end: Date }>;
  type: 'best' | 'worst';
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-elegant overflow-hidden">
      <div
        className={cn(
          'px-4 py-3 border-b',
          type === 'best' ? 'bg-pos/5 dark:bg-pos/10 border-pos/20' : 'bg-neg/5 dark:bg-neg/10 border-neg/20'
        )}
      >
        <h3 className="font-semibold tracking-tight">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Rank</th>
              <th className="px-4 py-2 text-left font-medium">Period</th>
              <th className="px-4 py-2 text-right font-medium">Return</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2 text-muted-foreground">#{i + 1}</td>
                <td className="px-4 py-2 tabular-nums">
                  {fmtDate(row.start)} → {fmtDate(row.end)}
                </td>
                <td
                  className={cn(
                    'px-4 py-2 text-right font-medium tabular-nums',
                    type === 'best' ? 'text-pos' : 'text-neg'
                  )}
                >
                  {fmtPct(row.pct, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BestWorstTab({ fundData }: { fundData: FundDetails }) {
  const { data } = fundData;
  const [windowIdx, setWindowIdx] = useState(3); // default 1Y
  const selectedWindow = WINDOWS[windowIdx];

  const result = useMemo(
    () => calcBestWorst(data, selectedWindow.days),
    [data, selectedWindow.days],
  );

  return (
    <div className="space-y-6">
      {/* Window selector */}
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

      {!result ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Not enough NAV history to compute {selectedWindow.label} windows.
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <WindowTable
              title={`Top 5 ${selectedWindow.label} Windows`}
              data={result.best}
              type="best"
            />
            <WindowTable
              title={`Bottom 5 ${selectedWindow.label} Windows`}
              data={result.worst}
              type="worst"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-elegant">
            <p className="text-muted-foreground">
              Median {selectedWindow.label} CAGR:{' '}
              <span className={cn('font-bold', result.median >= 0 ? 'text-pos' : 'text-neg')}>
                {fmtPct(result.median, 2)}
              </span>
              {'  ·  '}
              Computed over{' '}
              <span className="font-semibold">{result.count.toLocaleString()}</span> rolling
              windows
            </p>
          </div>
        </>
      )}
    </div>
  );
}
