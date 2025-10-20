import React from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';

type PickerFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.Picker>;
  };
  value: string;
  set: (value: string) => void;
};

const EMPTY_VALUE_PLACEHOLDER = '__lnreader_empty__';

export function PickerFilter({ filter, value, set }: PickerFilterProps) {
  // Map empty string to placeholder for Radix UI Select
  const displayValue = value === '' ? EMPTY_VALUE_PLACEHOLDER : value;

  // Handle change and map placeholder back to empty string
  const handleChange = (newValue: string) => {
    set(newValue === EMPTY_VALUE_PLACEHOLDER ? '' : newValue);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{filter.filter.label}</Label>
      <Select value={displayValue} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filter.filter.options.map(option => {
            // Map empty string values to placeholder
            const optionValue =
              option.value === '' ? EMPTY_VALUE_PLACEHOLDER : option.value;
            return (
              <SelectItem key={option.value || 'empty'} value={optionValue}>
                {option.label || option.value || 'All'}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
