import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FilterTypes } from '@libs/filterInputs';
import type { Filter } from '@libs/filterInputs';

type SwitchFilterProps = {
  filter: {
    key: string;
    filter: Filter<FilterTypes.Switch>;
  };
  value: boolean;
  set: (value: boolean) => void;
};

export function SwitchFilter({ filter, value, set }: SwitchFilterProps) {
  return (
    <div className="flex items-center justify-between space-x-2 py-2">
      <Label
        htmlFor={filter.key}
        className="text-sm font-medium cursor-pointer"
      >
        {filter.filter.label}
      </Label>
      <Switch id={filter.key} checked={value} onCheckedChange={set} />
    </div>
  );
}
