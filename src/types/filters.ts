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
  MultiText = 'MultiText',
}

type FilterValueMap = {
  [FilterTypes.TextInput]: string;
  [FilterTypes.Picker]: string;
  [FilterTypes.Switch]: boolean;
  [FilterTypes.CheckboxGroup]: string[];
  [FilterTypes.ExcludableCheckboxGroup]: {
    /** Checkboxes marked as included */
    include?: string[];
    /** Checkboxes marked as excluded */
    exclude?: string[];
  };
  [FilterTypes.MultiText]: string[];
};

type WithOptions =
  | FilterTypes.Picker
  | FilterTypes.CheckboxGroup
  | FilterTypes.ExcludableCheckboxGroup;

type OptionsOf<T extends FilterTypes> = T extends WithOptions
  ? { options: readonly FilterOption[] }
  : object;

/**
 * Filter types whose free-text field can request suggestions from the plugin.
 * Kept as a capability instead of a separate `FilterTypes` member so it can
 * extend to other input shapes later.
 */
type AutocompleteFilterTypes = FilterTypes.TextInput | FilterTypes.MultiText;

type AutocompleteOf<T extends FilterTypes> = T extends AutocompleteFilterTypes
  ? { autocomplete?: boolean }
  : object;

/**
 * key - filter pairs
 */
export type Filters = Record<string, Filter<FilterTypes>>;

/**
 * Get type of a single filter type from the {@link FilterType}
 */
export type Filter<T extends FilterTypes = FilterTypes> = T extends FilterTypes
  ? {
      label: string;
      type: T;
      value: FilterValueMap[T];
    } & OptionsOf<T> &
      AutocompleteOf<T>
  : never;

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
export type ValueOfFilter<T extends FilterTypes> = FilterValueMap[T];

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
