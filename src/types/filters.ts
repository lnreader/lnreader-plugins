/**
 * Filter's Options user can choose from
 */
export type FilterOption = {
  readonly label: string;
  readonly value: string;
};

/**
 * Every currently implemented FilterType
 */
export enum FilterTypes {
  TextInput = 'Text',
  Picker = 'Picker',
  CheckboxGroup = 'Checkbox',
  Switch = 'Switch',
  ExcludableCheckboxGroup = 'XCheckbox',
}

type SwitchFilter = {
  type: FilterTypes.Switch;
  /** Default value */
  value: boolean;
};

type TextFilter = {
  type: FilterTypes.TextInput;
  /** Default value */
  value: string;
};

type CheckboxFilter = {
  type: FilterTypes.CheckboxGroup;
  options: readonly FilterOption[];
  /** Default value */
  value: string[];
};
type PickerFilter = {
  type: FilterTypes.Picker;
  options: readonly FilterOption[];
  /** Default value */
  value: string;
};

type ExcludableCheckboxFilter = {
  type: FilterTypes.ExcludableCheckboxGroup;
  options: readonly FilterOption[];
  /** Default value */
  value: {
    /** Checkboxes marked as included */
    include?: string[];
    /** Checkboxes marked as excluded */
    exclude?: string[];
  };
};

/**
 * key - filter pairs
 */
export type Filters = Record<string, Filter<FilterTypes>>;

/** Mapping of each FilterType to a Filter */
type FilterFromType = {
  [FilterTypes.CheckboxGroup]: CheckboxFilter;
  [FilterTypes.ExcludableCheckboxGroup]: ExcludableCheckboxFilter;
  [FilterTypes.Picker]: PickerFilter;
  [FilterTypes.Switch]: SwitchFilter;
  [FilterTypes.TextInput]: TextFilter;
};

/**
 * Get type of a single filter type from the {@link FilterType}
 */
export type Filter<Type extends FilterTypes> = {
  label: string;
} & FilterFromType[Type];

/**
 * Strip {@link FilterObject} object from 'label' and 'options' to get key - filter_value pairs
 * @see {@link ValueOfFilter}
 */
export type FilterToValues<
  FilterObject extends Record<string, { type: FilterTypes }> | undefined,
> = FilterObject extends undefined
  ? undefined
  : {
      // copy the Filters object, but just get {value,type} pairs instead of the whole Filter object
      [SingleFilter in keyof FilterObject]: FilterValueWithType<
        FilterType<NonNullable<FilterObject>[SingleFilter]>
      >;
    };

/**
 * Get value type for a {@link Filter} given it's FilterType
 * @see {@link FilterTypes}
 */
export type ValueOfFilter<T extends FilterTypes> =
  T extends FilterTypes.CheckboxGroup
    ? CheckboxFilter['value']
    : T extends FilterTypes.Picker
      ? PickerFilter['value']
      : T extends FilterTypes.Switch
        ? SwitchFilter['value']
        : T extends FilterTypes.TextInput
          ? TextFilter['value']
          : T extends FilterTypes.ExcludableCheckboxGroup
            ? ExcludableCheckboxFilter['value']
            : never;

/** Get {@link Filter}'s type */
export type FilterType<T extends { type: unknown }> = T extends {
  type: infer K;
}
  ? K extends FilterTypes
    ? K
    : never
  : never;

/** Get {type, value} types for given FilterType
 * @see {@link ValueOfFilter}
 */
export type FilterValueWithType<T extends FilterTypes> = {
  type: T;
  value: ValueOfFilter<T>;
};

/**
 * Any possible filter value
 */
export type AnyFilterValue = ValueOfFilter<FilterTypes>;
