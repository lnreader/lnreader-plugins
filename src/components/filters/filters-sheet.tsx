import React, { useEffect, useState, ReactNode } from 'react';
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
import { PickerFilter } from './picker-filter';
import { SwitchFilter } from './switch-filter';
import { TextFilter } from './text-filter';
import { CheckboxFilter } from './checkbox-filter';
import { ExcludableCheckboxFilter } from './excludable-checkbox-filter';
import { RotateCcw } from 'lucide-react';

const renderFilters = (
  filters: Filters | undefined,
  values: FilterToValues<Filters> | undefined,
  set: (key: string, v: AnyFilterValue) => void,
): React.ReactNode => {
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: FilterToValues<Filters> | undefined;
  filters: Filters | undefined;
  setValues: React.Dispatch<
    React.SetStateAction<FilterToValues<Filters> | undefined>
  >;
  refetch: () => void;
};

export function FiltersSheet({
  open,
  onOpenChange,
  values,
  setValues,
  filters,
  refetch,
}: FiltersSheetProps) {
  const [filterElements, setFilterElements] = useState<ReactNode>(null);

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

  useEffect(() => {
    setFilterElements(renderFilters(filters, values, setFilterWithKey));
  }, [values, filters]);

  const handleApply = () => {
    refetch();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>
            Customize your search with these filter options
          </SheetDescription>
        </SheetHeader>
        <div className="py-6 space-y-4">
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
