import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { FundSearchBar } from './components/Search/FundSearchBar';
import { OverviewTab } from './components/Tabs/OverviewTab';
import { RollingTab } from './components/Tabs/RollingTab';
import { BestWorstTab } from './components/Tabs/BestWorstTab';
import { AnnualTab } from './components/Tabs/AnnualTab';
import { SipCalcTab } from './components/Tabs/SipCalcTab';
import { CompareTab } from './components/Tabs/CompareTab';
import { RankingsTab } from './components/Tabs/RankingsTab';
import { PortfolioTab } from './components/Tabs/PortfolioTab';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { fetchFundDetails } from './services/api';
import type { SchemeListItem } from './types/fund';
import { cn } from './lib/utils';

const TABS = [
  { key: 'overview',  label: 'Overview'  },
  { key: 'rolling',   label: 'Rolling'   },
  { key: 'bestworst', label: 'Best/Worst'},
  { key: 'annual',    label: 'Annual'    },
  { key: 'sip',       label: 'SIP Calc'  },
  { key: 'compare',   label: 'Compare'   },
  { key: 'rankings',  label: 'Rankings'  },
  { key: 'portfolio', label: 'Portfolio' },
] as const;

type TabKey = typeof TABS[number]['key'];

// Popular funds to show on the landing page
const FEATURED: SchemeListItem[] = [
  { schemeCode: 120716, schemeName: 'UTI Nifty 50 Index Fund' },
  { schemeCode: 122639, schemeName: 'Parag Parikh Flexi Cap Fund' },
  { schemeCode: 119533, schemeName: 'HDFC Mid-Cap Opportunities Fund' },
  { schemeCode: 125497, schemeName: 'Mirae Asset Large Cap Fund' },
];

export default function App() {
  const [selectedScheme, setSelectedScheme] = useState<SchemeListItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const { data: fundData, isLoading, error } = useQuery({
    queryKey: ['scheme', selectedScheme?.schemeCode],
    queryFn: () => selectedScheme ? fetchFundDetails(selectedScheme.schemeCode) : null,
    enabled: !!selectedScheme,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  });

  function handleSelect(scheme: SchemeListItem) {
    setSelectedScheme(scheme);
    setActiveTab('overview');
  }

  const tabContent = () => {
    if (!fundData) return null;
    switch (activeTab) {
      case 'overview':  return <OverviewTab fundData={fundData} />;
      case 'rolling':   return <RollingTab  fundData={fundData} />;
      case 'bestworst': return <BestWorstTab fundData={fundData} />;
      case 'annual':    return <AnnualTab   fundData={fundData} />;
      case 'sip':       return <SipCalcTab  fundData={fundData} />;
      case 'compare':   return <CompareTab  primaryFund={fundData} />;
      case 'rankings':  return <RankingsTab onFundSelect={handleSelect} />;
      case 'portfolio': return <PortfolioTab primaryFund={fundData} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-lg font-extrabold tracking-tight">FundMetrics</span>
          </div>
          <div className="flex-1">
            <FundSearchBar onSelect={handleSelect} variant="header" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {/* Landing — no fund selected */}
        {!selectedScheme && (
          <div className="mx-auto max-w-2xl py-12 text-center">
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
              Analyse any Indian mutual fund
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Live NAV history · Rolling CAGRs · Expense-ratio SIP calculator ·
              Fund comparison · Rankings — all from public AMFI data, fully in-browser.
            </p>
            <div className="mx-auto mt-8 max-w-xl">
              <FundSearchBar onSelect={handleSelect} autoFocus placeholder="Search e.g. Parag Parikh, HDFC, Nifty 50…" />
            </div>
            <div className="mt-10">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Popular funds
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FEATURED.map(s => (
                  <button
                    key={s.schemeCode}
                    onClick={() => handleSelect(s)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm shadow-elegant transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="truncate font-medium">{s.schemeName}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{s.schemeCode}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="animate-pulse text-sm text-muted-foreground">Fetching NAV history…</p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="mx-auto mt-12 max-w-md rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-800 dark:bg-red-950">
            <p className="font-semibold text-red-700 dark:text-red-400">Failed to load fund data</p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-500">
              {error instanceof Error ? error.message : 'Network error. Please try again.'}
            </p>
            <button
              onClick={() => setSelectedScheme(null)}
              className="mt-3 text-sm underline text-red-600 dark:text-red-400"
            >
              Go back
            </button>
          </div>
        )}

        {/* Fund detail view */}
        {fundData && !isLoading && (
          <div className="space-y-0">
            {/* Tab bar */}
            <div className="mb-6 flex gap-0.5 overflow-x-auto rounded-xl border border-border bg-muted p-1">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-all whitespace-nowrap',
                    activeTab === tab.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Active tab content */}
            {tabContent()}
          </div>
        )}

        {/* Rankings available without a fund selected */}
        {selectedScheme && !fundData && !isLoading && activeTab === 'rankings' && (
          <RankingsTab onFundSelect={handleSelect} />
        )}
      </main>

      <Toaster position="top-right" />
    </div>
  );
}
