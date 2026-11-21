import React, { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';
import {
  useFilterSuggestions,
  type FilterSuggestionSource,
} from '@/hooks/useFilterSuggestions';
import { cn } from '@/lib/utils';
import { addMultiTextValues } from './filter-utils';
import { FilterSuggestions } from './filter-suggestions';

type MultiTextFilterProps = {
  fetchSuggestions: FilterSuggestionSource;
  filter: {
    key: string;
    filter: Filter<FilterTypes.MultiText>;
  };
  pluginId: string;
  registerDismiss: (dismiss: () => void) => () => void;
  set: (value: string[]) => void;
  value: string[];
};

export function MultiTextFilter({
  fetchSuggestions,
  filter,
  pluginId,
  registerDismiss,
  set,
  value,
}: MultiTextFilterProps) {
  const [input, setInput] = useState('');
  const anchorRef = useRef<HTMLInputElement>(null);
  const isAutocomplete = !!filter.filter.autocomplete;

  // Commit on submit, split pasted newlines, commas stay literal.
  const commit = (rawText: string) => {
    const next = addMultiTextValues(value, rawText.split('\n'));
    if (next.length !== value.length) {
      set(next);
    }
    setInput('');
  };

  const field = useFilterSuggestions({
    pluginId,
    filterKey: filter.key,
    query: isAutocomplete ? input : '',
    fetchSuggestions,
    onSelect: option => commit(option.value),
  });

  useEffect(
    () => registerDismiss(field.dismiss),
    [field.dismiss, registerDismiss],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={filter.key} className="text-sm font-medium">
        {filter.filter.label}
      </Label>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map(chip => (
            <span
              key={chip}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full',
                'bg-secondary py-0.5 pl-2.5 pr-1 text-xs text-secondary-foreground',
              )}
            >
              <button
                type="button"
                aria-label={`Edit ${chip}`}
                onClick={() => {
                  setInput(chip);
                  set(value.filter(v => v !== chip));
                }}
                className="min-w-0 truncate"
              >
                {chip}
              </button>
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => set(value.filter(v => v !== chip))}
                className="rounded-full p-0.5 hover:bg-background/50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative flex items-center gap-2">
        <Input
          id={filter.key}
          ref={anchorRef}
          value={input}
          onChange={event => {
            if (isAutocomplete) {
              field.onEdit();
            }
            // A newline only arrives via paste, so split it into chips now.
            if (event.target.value.includes('\n')) {
              commit(event.target.value);
            } else {
              setInput(event.target.value);
            }
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(input);
            }
          }}
          placeholder={`Add ${filter.filter.label.toLowerCase()}...`}
          autoComplete="off"
          aria-autocomplete={isAutocomplete ? 'list' : undefined}
          aria-expanded={isAutocomplete ? field.isVisible : undefined}
          {...(isAutocomplete
            ? { onBlur: field.onBlur, onFocus: field.onFocus }
            : {})}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Add ${filter.filter.label}`}
          disabled={!input.trim()}
          onClick={() => commit(input)}
        >
          <Plus className="size-4" />
        </Button>
        <FilterSuggestions
          anchorRef={anchorRef}
          onDismiss={field.dismiss}
          onSelect={field.select}
          suggestions={field.suggestions}
          visible={field.isVisible}
        />
      </div>
    </div>
  );
}
