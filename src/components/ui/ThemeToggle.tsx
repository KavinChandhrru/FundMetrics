import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '../../lib/utils';

type Theme = 'light' | 'dark' | 'system';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  localStorage.setItem('fm-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('fm-theme') as Theme | null;
    return stored ?? 'system';
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Also react to system preference changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'light',  icon: <Sun  className="h-3.5 w-3.5" />, label: 'Light'  },
    { value: 'system', icon: <Monitor className="h-3.5 w-3.5" />, label: 'System' },
    { value: 'dark',   icon: <Moon className="h-3.5 w-3.5" />, label: 'Dark'   },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          aria-label={opt.label}
          title={opt.label}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
            theme === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
