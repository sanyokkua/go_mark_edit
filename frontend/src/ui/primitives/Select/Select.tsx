import styles from './Select.module.css';

export interface SelectOption<Value extends string> {
    readonly label: string;
    readonly value: Value;
}

export interface SelectProps<Value extends string> {
    readonly describedBy?: string;
    readonly disabled?: boolean;
    /** Accessible name; the visible label lives beside the control. */
    readonly label: string;
    readonly onChange: (value: Value) => void;
    readonly options: readonly SelectOption<Value>[];
    readonly value: Value;
}

/** A drop-down choice from a short list, using the platform control. */
const Select = <Value extends string>({
    describedBy,
    disabled = false,
    label,
    onChange,
    options,
    value,
}: SelectProps<Value>): React.JSX.Element => (
    <select
        aria-describedby={describedBy}
        aria-label={label}
        className={styles.select}
        disabled={disabled}
        value={value}
        onChange={(event): void => onChange(event.target.value as Value)}
    >
        {options.map((option): React.JSX.Element => (
            <option key={option.value} value={option.value}>
                {option.label}
            </option>
        ))}
    </select>
);

export default Select;
