import React from 'react';

import { Plugin } from '@/types/plugin';

type PluginHeaderProps = {
  selectedPlugin?: Plugin.PluginBase;
};

export default function PluginHeader({ selectedPlugin }: PluginHeaderProps) {
  return (
    <header className="border-b">
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
      </div>
    </header>
  );
}
