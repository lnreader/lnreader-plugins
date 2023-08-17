export interface FilterValue {
    label: string;
    value: string | number;
}
export enum FilterInputs {
    TextInput,
    Picker,
    Checkbox,
}
export interface Filter {
    key: string;
    label: string;
    values: FilterValue[];
    inputType: FilterInputs;
}
