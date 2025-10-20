import React from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';

type CheckboxFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.CheckboxGroup>;
  };
  value: string[];
  set: (value: string[]) => void;
};

export function CheckboxFilter({ filter, value, set }: CheckboxFilterProps) {
  const toggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      set(value.filter(v => v !== optionValue));
    } else {
      set([...value, optionValue]);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{filter.filter.label}</Label>
      <div className="space-y-2">
        {filter.filter.options.map(option => (
          <div key={option.value} className="flex items-center space-x-2">
            <Checkbox
              id={`${filter.key}-${option.value}`}
              checked={value.includes(option.value)}
              onCheckedChange={() => toggleOption(option.value)}
            />
            <Label
              htmlFor={`${filter.key}-${option.value}`}
              className="text-sm font-normal cursor-pointer"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
