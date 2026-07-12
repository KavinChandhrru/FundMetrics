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

function WindowCard({
  title,
  pct,
  start,
  end,
  type,
}: {
  title: string;
  pct: number;
  start: Date;
  end: Date;
  type: 'best' | 'worst';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 shadow-elegant',
        type === 'best'
          ? 'border-pos/30 bg-pos/5 dark:bg-pos/10'
          : 'border-neg/30 bg-neg/5 dark:bg-neg/10',
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p
        className={cn(
          'mt-1 text-3xl font-bold tabular-nums',
          type === 'best' ? 'text-pos' : 'text-neg',
        )}
      >
        {fmtPct(pct, 2)}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {fmtDate(start)} → {fmtDate(end)}
      </p>
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
          <div className="grid gap-4 md:grid-cols-2">
            <WindowCard
              title={`Best ${selectedWindow.label} window`}
              pct={result.best.pct}
              start={result.best.start}
              end={result.best.end}
              type="best"
            />
            <WindowCard
              title={`Worst ${selectedWindow.label} window`}
              pct={result.worst.pct}
              start={result.worst.start}
              end={result.worst.end}
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
