import React, { useState } from 'react';
import { Search } from 'lucide-react';

export function FundSearchBar({ onSelect }: { onSelect: (code: string) => void }) {
  const [query, setQuery] = useState('');
  
  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="flex items-center border border-border rounded-lg px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-primary shadow-sm transition-all">
        <Search className="w-5 h-5 text-muted-foreground mr-2" />
        <input 
          className="flex-1 bg-transparent outline-none" 
          placeholder="Search for a mutual fund (e.g. Parag Parikh Flexi Cap)..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {/* Dropdown results would go here */}
    </div>
  );
}
