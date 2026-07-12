import React, { useState } from 'react';
import { FundSearchBar } from './components/Search/FundSearchBar';
import { OverviewTab } from './components/Tabs/OverviewTab';
import { useQuery } from '@tanstack/react-query';
import { fetchFundDetails } from './services/api';
import { Toaster } from 'sonner';

function App() {
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['fund', selectedFund],
    queryFn: () => selectedFund ? fetchFundDetails(selectedFund) : null,
    enabled: !!selectedFund,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight">FundMetrics</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Client-side Indian Mutual Fund analytics. Zero servers, maximum privacy.
          </p>
        </header>

        <FundSearchBar onSelect={setSelectedFund} />

        <main className="mt-8 transition-all">
          {isLoading && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="mt-4 text-muted-foreground animate-pulse">Fetching NAV history...</p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 text-red-600 border border-red-200 rounded-lg text-center">
              Failed to fetch fund data. Please check the network.
            </div>
          )}
          {!isLoading && !error && <OverviewTab fundData={data} />}
        </main>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
