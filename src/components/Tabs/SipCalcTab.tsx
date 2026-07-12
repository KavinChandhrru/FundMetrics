import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { FundDetails } from '../../types/fund';
import { simulateSip, fmtPct, fmtINR, fmtDate, yearsBetween } from '../../utils/financialMath';
import { MetricCard } from '../ui/MetricCard';

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

export function SipCalcTab({ fundData }: { fundData: FundDetails }) {
  const { data } = fundData;

  const maxYears = useMemo(() => {
    if (data.length < 2) return 1;
    return Math.max(1, Math.floor(yearsBetween(data[0].date, data[data.length - 1].date)));
  }, [data]);

  const defaultExpenseRatio = useMemo(() => {
    const name = fundData.meta.scheme_name.toLowerCase();
    if (name.includes('etf') || name.includes('index')) return 0.2;
    if (name.includes('direct')) return 0.65;
    if (name.includes('regular')) return 1.5;
    return 1.0;
  }, [fundData.meta.scheme_name]);

  const [monthly,      setMonthly]      = useState(10_000);
  const [lumpsum,      setLumpsum]      = useState(0);
  const [years,        setYears]        = useState(Math.min(10, maxYears));
  const [expenseRatio, setExpenseRatio] = useState(defaultExpenseRatio);

  useEffect(() => {
    setExpenseRatio(defaultExpenseRatio);
  }, [defaultExpenseRatio]);

  const result = useMemo(
    () => simulateSip(data, { monthly, lumpsum, years, expenseRatio }),
    [data, monthly, lumpsum, years, expenseRatio],
  );

  const chartData = result?.snapshots.map(s => ({
    date: fmtDate(s.date),
    gross: Math.round(s.gross),
    net: Math.round(s.net),
    invested: Math.round(s.invested),
  }));

  function NumberInput({ label, value, onChange, min, max, step, prefix }: {
    label: string; value: number; onChange: (v: number) => void;
    min: number; max: number; step: number; prefix?: string;
  }) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
          <input
            type="number"
            min={min} max={max} step={step}
            value={value}
            onChange={e => onChange(clamp(parseFloat(e.target.value) || 0, min, max))}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberInput label="Monthly SIP (₹)"    value={monthly}      onChange={setMonthly}      min={0}    max={10_000_000} step={1000}  prefix="₹" />
        <NumberInput label="Lumpsum (₹)"        value={lumpsum}      onChange={setLumpsum}      min={0}    max={100_000_000} step={10000} prefix="₹" />
        <NumberInput label="Horizon (years)"    value={years}        onChange={setYears}        min={1}    max={maxYears}   step={1} />
        <NumberInput label="Expense Ratio (%)"  value={expenseRatio} onChange={setExpenseRatio} min={0}    max={5}          step={0.05} />
      </div>

      {!result ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Not enough NAV history for the selected horizon.
        </div>
      ) : (
        <>
          {/* SIP metrics */}
          {monthly > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                SIP Results ({result.sipInstalments} instalments · {fmtINR(result.sipInvested)} invested)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <MetricCard label="Final Value (Gross)" value={fmtINR(result.finalSipGross)} sentiment="pos" />
                <MetricCard label="Final Value (Net)"   value={fmtINR(result.finalSipNet)}   sentiment="pos" />
                <MetricCard label="XIRR (Gross)"        value={fmtPct(result.sipXirrGross, 2)} sentiment={result.sipXirrGross !== null ? (result.sipXirrGross >= 0 ? 'pos' : 'neg') : 'neutral'} />
                <MetricCard label="XIRR (Net, after ER)" value={fmtPct(result.sipXirrNet,   2)} sentiment={result.sipXirrNet   !== null ? (result.sipXirrNet   >= 0 ? 'pos' : 'neg') : 'neutral'} subLabel={`Fees: ${fmtINR(result.sipFees)}`} />
              </div>
            </div>
          )}

          {/* Lumpsum metrics */}
          {lumpsum > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                Lumpsum Results ({fmtINR(lumpsum)} invested)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <MetricCard label="Final Value (Gross)" value={fmtINR(result.finalLumpGross)} sentiment="pos" />
                <MetricCard label="Final Value (Net)"   value={fmtINR(result.finalLumpNet)}   sentiment="pos" />
                <MetricCard label="CAGR (Gross)"        value={fmtPct(result.lumpCagrGross, 2)} sentiment={result.lumpCagrGross !== null ? (result.lumpCagrGross >= 0 ? 'pos' : 'neg') : 'neutral'} />
                <MetricCard label="CAGR (Net, after ER)" value={fmtPct(result.lumpCagrNet,   2)} sentiment={result.lumpCagrNet   !== null ? (result.lumpCagrNet   >= 0 ? 'pos' : 'neg') : 'neutral'} subLabel={`Fees: ${fmtINR(result.lumpFees)}`} />
              </div>
            </div>
          )}

          {/* Growth chart */}
          {chartData && chartData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-elegant">
              <h3 className="mb-3 text-sm font-semibold">Portfolio Growth</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => v >= 1e6 ? `₹${(v/1e6).toFixed(1)}L` : `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} width={64} />
                  <Tooltip formatter={(v: number) => [fmtINR(v)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="gross"    name="Gross Value"    stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#grossGrad)" dot={false} />
                  <Area type="monotone" dataKey="net"      name="Net Value"      stroke="hsl(var(--neg))"     strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" />
                  <Area type="monotone" dataKey="invested" name="Amount Invested" stroke="hsl(var(--muted-foreground))" strokeWidth={1} fill="none" dot={false} strokeDasharray="2 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-elegant">
            Actual period: {fmtDate(result.startDate)} → {fmtDate(result.endDate)} ({result.actualYears.toFixed(1)} years).
            Total fees paid: <span className="font-semibold">{fmtINR(result.totalFees)}</span>.
            Net values reflect daily expense ratio compounding of {expenseRatio}% p.a.
          </div>
        </>
      )}
    </div>
  );
}
