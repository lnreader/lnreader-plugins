import React from 'react';
import { Moon, Sun } from 'lucide-react';

import { Plugin } from '@/types/plugin';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';

type PluginHeaderProps = {
  selectedPlugin?: Plugin.PluginBase;
};

export default function PluginHeader({ selectedPlugin }: PluginHeaderProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const isDark = theme === 'dark';

  return (
    <header className="border-b border-border">
      <div className="px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent-soft)] text-xl font-semibold text-[var(--color-accent-strong)] transition-colors">
            読
          </span>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              Plugin Playground
            </h1>
            <p className="text-xs text-muted-foreground">
              {selectedPlugin?.name}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-9 w-9"
          aria-label="Toggle theme"
          title={`Theme: ${theme}`}
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
