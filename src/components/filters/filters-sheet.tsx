import React, { useCallback, useRef } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AnyFilterValue,
  Filters,
  FilterToValues,
  FilterTypes,
} from '@libs/filterInputs';
import type { FilterSuggestionSource } from '@/hooks/useFilterSuggestions';
import type { Plugin } from '@/types/plugin';
import { CheckboxFilter } from './checkbox-filter';
import { ExcludableCheckboxFilter } from './excludable-checkbox-filter';
import { PickerFilter } from './picker-filter';
import { SwitchFilter } from './switch-filter';
import { TextFilter } from './text-filter';

type RegisterDismiss = (dismiss: () => void) => () => void;

type RenderFiltersOptions = {
  dismissers: RegisterDismiss;
  fetchSuggestions: FilterSuggestionSource;
  filters: Filters | undefined;
  pluginId: string;
  set: (key: string, v: AnyFilterValue) => void;
  values: FilterToValues<Filters> | undefined;
};

const renderFilters = ({
  dismissers,
  fetchSuggestions,
  filters,
  pluginId,
  set,
  values,
}: RenderFiltersOptions): React.ReactNode => {
  const isValueCorrectType = <T extends AnyFilterValue>(
    o: AnyFilterValue,
    f: T,
  ): o is T => {
    const checkIfIsCorrectObjectType = (o: AnyFilterValue, f: T): o is T => {
      const areArrays = Array.isArray(o) && Array.isArray(f);
      const areObjects = typeof o === 'object' && typeof f === 'object';
      return areArrays || areObjects;
    };
    return typeof o === typeof f || checkIfIsCorrectObjectType(o, f);
  };

  if (!filters || !values) return null;

  return (
    <>
      {Object.entries(filters).map(([key, filter]) => {
        if (!(key in values)) {
          console.error(`No filter value for ${key} in filter values!`);
          return null;
        }
        switch (filter.type) {
          case FilterTypes.Picker: {
            const value = values[key].value;
            if (!isValueCorrectType<typeof filter.value>(value, filter.value)) {
              console.error(
                `FilterValue for filter [${key}] has a wrong type!`,
              );
              return null;
            }
            return (
              <PickerFilter
                key={`picker_filter_${key}`}
                filter={{ key, filter }}
                value={value}
                set={newValue => set(key, newValue)}
              />
            );
          }
          case FilterTypes.Switch: {
            const value = values[key].value;
            if (!isValueCorrectType<typeof filter.value>(value, filter.value)) {
              console.error(
                `FilterValue for filter [${key}] has a wrong type!`,
              );
              return null;
            }
            return (
              <SwitchFilter
                filter={{ key, filter }}
                key={`switch_filter_${key}`}
                value={value}
                set={newValue => set(key, newValue)}
              />
            );
          }
          case FilterTypes.TextInput: {
            const value = values[key].value;
            if (!isValueCorrectType(value, filter.value)) {
              console.error(
                `FilterValue for filter [${key}] has a wrong type!`,
              );
              return null;
            }
            return (
              <TextFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                key={`text_filter_${key}`}
                pluginId={pluginId}
                fetchSuggestions={fetchSuggestions}
                registerDismiss={dismissers}
              />
            );
          }
          case FilterTypes.CheckboxGroup: {
            const value = values[key].value;
            if (!isValueCorrectType(value, filter.value)) {
              console.error(
                `FilterValue for filter [${key}] has a wrong type!`,
              );
              return null;
            }
            return (
              <CheckboxFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                key={`checkbox_filter_${key}`}
              />
            );
          }
          case FilterTypes.ExcludableCheckboxGroup: {
            const value = values[key].value;
            if (!isValueCorrectType(value, filter.value)) {
              console.error(
                `FilterValue for filter [${key}] has a wrong type!`,
              );
              return null;
            }
            return (
              <ExcludableCheckboxFilter
                filter={{ key, filter }}
                set={newValue => set(key, newValue)}
                value={value}
                key={`xcheсkbox_filter_${key}`}
              />
            );
          }
        }
      })}
    </>
  );
};

type FiltersSheetProps = {
  filters: Filters | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  plugin: Plugin.PluginBase | undefined;
  refetch: () => void;
  setValues: React.Dispatch<
    React.SetStateAction<FilterToValues<Filters> | undefined>
  >;
  values: FilterToValues<Filters> | undefined;
};

export function FiltersSheet({
  open,
  onOpenChange,
  values,
  setValues,
  filters,
  plugin,
  refetch,
}: FiltersSheetProps) {
  // Suggestions are portaled above the sheet, so they must close whenever the
  // sheet scrolls or the field that anchors them moves.
  const dismissers = useRef(new Set<() => void>());
  const registerDismiss = useCallback<RegisterDismiss>(dismiss => {
    dismissers.current.add(dismiss);
    return () => {
      dismissers.current.delete(dismiss);
    };
  }, []);
  const dismissSuggestions = useCallback(() => {
    dismissers.current.forEach(dismiss => dismiss());
  }, []);

  const fetchSuggestions = useCallback<FilterSuggestionSource>(
    (filterKey, query) =>
      plugin?.getFilterSuggestions?.(filterKey, query) ?? Promise.resolve([]),
    [plugin],
  );

  const setFilterWithKey = (key: string, newValue: AnyFilterValue) =>
    setValues(fValues =>
      !fValues
        ? fValues
        : {
            ...fValues,
            [key]: {
              ...fValues[key],
              value: newValue,
            },
          },
    );

  const resetFilters = () => {
    if (filters) {
      const resetValues: FilterToValues<typeof filters> = {};
      for (const fKey in filters) {
        resetValues[fKey as keyof typeof resetValues] = {
          type: filters[fKey].type,
          value: filters[fKey].value,
        };
      }
      setValues(resetValues);
    }
  };

  const handleApply = () => {
    refetch();
    onOpenChange(false);
  };

  const filterElements = renderFilters({
    dismissers: registerDismiss,
    fetchSuggestions,
    filters,
    pluginId: plugin?.id ?? '',
    set: setFilterWithKey,
    values,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        onScroll={dismissSuggestions}
      >
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Customize your search with these filter options
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-6">
          {filterElements || (
            <p className="text-sm text-muted-foreground text-center py-8">
              No filters available
            </p>
          )}
        </div>
        <SheetFooter className="flex-col sm:flex-col gap-2">
          <Button onClick={handleApply} className="w-full">
            Apply Filters
          </Button>
          <Button
            variant="outline"
            onClick={resetFilters}
            className="w-full gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
