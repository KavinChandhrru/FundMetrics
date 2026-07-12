import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchSchemeList, filterSchemes } from '../../services/api';
import type { SchemeListItem } from '../../types/fund';
import { cn } from '../../lib/utils';

interface FundSearchBarProps {
  onSelect: (scheme: SchemeListItem) => void;
  placeholder?: string;
  autoFocus?: boolean;
  variant?: 'inline' | 'header';
}

const DEBOUNCE_MS = 300;

export function FundSearchBar({
  onSelect,
  placeholder = 'Search e.g. Parag Parikh, HDFC Mid Cap, Nifty 50…',
  autoFocus = false,
  variant = 'inline',
}: FundSearchBarProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch full scheme list once (cached indefinitely)
  const { data: schemes = [], isLoading: schemesLoading } = useQuery({
    queryKey: ['schemes'],
    queryFn: fetchSchemeList,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const results = filterSchemes(schemes, debouncedQuery, 50);

  useEffect(() => {
    setIsOpen(debouncedQuery.length > 0 && results.length > 0);
    setActiveIndex(-1);
  }, [debouncedQuery, results.length]);

  const handleSelect = useCallback((scheme: SchemeListItem) => {
    setQuery('');
    setDebouncedQuery('');
    setIsOpen(false);
    onSelect(scheme);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const inputId = 'fund-search-input';

  return (
    <div className={cn('relative', variant === 'inline' ? 'w-full max-w-xl mx-auto' : 'w-64')}>
      {/* Search input */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="fund-search-listbox"
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border bg-background',
          'px-3 py-2.5 shadow-sm transition-all',
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
        )}
      >
        {schemesLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls="fund-search-listbox"
          aria-activedescendant={activeIndex >= 0 ? `fund-option-${activeIndex}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => debouncedQuery && results.length > 0 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setQuery(''); setDebouncedQuery(''); inputRef.current?.focus(); }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul
          id="fund-search-listbox"
          ref={listRef}
          role="listbox"
          aria-label="Fund search results"
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-1.5',
            'max-h-72 overflow-y-auto rounded-xl border border-border bg-popover',
            'py-1 shadow-elegant',
          )}
        >
          {results.map((scheme, i) => (
            <li
              key={scheme.schemeCode}
              id={`fund-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => handleSelect(scheme)}
              className={cn(
                'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm transition-colors',
                i === activeIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/60',
              )}
            >
              <span className="flex-1 leading-snug">{scheme.schemeName}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                #{scheme.schemeCode}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
