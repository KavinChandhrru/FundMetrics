import React from 'react';

export function OverviewTab({ fundData }: { fundData: any }) {
  if (!fundData) {
    return (
      <div className="p-12 text-center border border-dashed border-border rounded-xl bg-card">
        <h2 className="text-xl font-medium">No Fund Selected</h2>
        <p className="text-muted-foreground mt-2">Search and select a mutual fund to view analytics.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-border">
        <h2 className="text-2xl font-bold">{fundData.meta.scheme_name}</h2>
        <p className="text-muted-foreground">{fundData.meta.scheme_category} | {fundData.meta.fund_house}</p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="p-6 bg-card border border-border rounded-xl shadow-elegant">
          <h3 className="text-sm font-medium text-muted-foreground">Current NAV</h3>
          <p className="text-3xl font-bold mt-2">
            ₹{fundData.data[0]?.nav || 'N/A'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">As of {fundData.data[0]?.date}</p>
        </div>
        
        {/* Additional metrics to be implemented using src/utils/financialMath.ts */}
      </div>
    </div>
  );
}
