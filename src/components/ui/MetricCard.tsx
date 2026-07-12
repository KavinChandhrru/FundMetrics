import { cn } from '../../lib/utils';

interface MetricCardProps {
  label: string;
  value: string | null;
  subLabel?: string;
  /** 'pos' = green, 'neg' = red, 'neutral' = default */
  sentiment?: 'pos' | 'neg' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
}

export function MetricCard({
  label,
  value,
  subLabel,
  sentiment = 'neutral',
  size = 'md',
}: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-elegant transition-shadow hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-bold tabular-nums',
          size === 'sm' && 'text-xl',
          size === 'md' && 'text-2xl',
          size === 'lg' && 'text-3xl',
          sentiment === 'pos' && 'text-pos',
          sentiment === 'neg' && 'text-neg',
          sentiment === 'neutral' && 'text-foreground',
          value === null && 'text-muted-foreground',
        )}
      >
        {value ?? 'N/A'}
      </p>
      {subLabel && (
        <p className="mt-1 text-[11px] text-muted-foreground">{subLabel}</p>
      )}
    </div>
  );
}
