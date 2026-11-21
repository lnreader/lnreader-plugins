import React, { useEffect, useRef } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';
import {
  useFilterSuggestions,
  type FilterSuggestionSource,
} from '@/hooks/useFilterSuggestions';
import { FilterSuggestions } from './filter-suggestions';

type TextFilterProps = {
  fetchSuggestions: FilterSuggestionSource;
  filter: {
    key: string;
    filter: Filter<FilterTypes.TextInput>;
  };
  pluginId: string;
  registerDismiss: (dismiss: () => void) => () => void;
  set: (value: string) => void;
  value: string;
};

export function TextFilter({
  fetchSuggestions,
  filter,
  pluginId,
  registerDismiss,
  set,
  value,
}: TextFilterProps) {
  const anchorRef = useRef<HTMLInputElement>(null);
  const isAutocomplete = !!filter.filter.autocomplete;

  const field = useFilterSuggestions({
    pluginId,
    filterKey: filter.key,
    query: isAutocomplete ? value : '',
    fetchSuggestions,
    onSelect: option => set(option.value),
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
      <div className="relative">
        <Input
          id={filter.key}
          ref={anchorRef}
          value={value}
          onChange={event => {
            if (isAutocomplete) {
              field.onEdit();
            }
            set(event.target.value);
          }}
          placeholder={`Enter ${filter.filter.label.toLowerCase()}...`}
          autoComplete="off"
          aria-autocomplete={isAutocomplete ? 'list' : undefined}
          aria-expanded={isAutocomplete ? field.isVisible : undefined}
          {...(isAutocomplete
            ? { onBlur: field.onBlur, onFocus: field.onFocus }
            : {})}
        />
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
