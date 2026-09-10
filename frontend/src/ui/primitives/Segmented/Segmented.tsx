import { useEffect, useRef } from 'react';

import styles from './Segmented.module.css';

export interface SegmentedOption<Value extends string> {
  readonly label: string;
  readonly value: Value;
}

export interface SegmentedProps<Value extends string> {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly onChange: (value: Value) => void;
  readonly options: readonly SegmentedOption<Value>[];
  readonly optionClassName?: string;
  /** Keep the active editor selection when the segment is activated. */
  readonly preserveSelection?: boolean;
  readonly value: Value;
}

function nextIndex(
  currentIndex: number,
  length: number,
  key: string,
): number | undefined {
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return (currentIndex - 1 + length) % length;
  }
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return (currentIndex + 1) % length;
  }
  return undefined;
}

const Segmented = <Value extends string>({
  ariaLabel,
  className,
  onChange,
  options,
  optionClassName,
  preserveSelection = true,
  value,
}: SegmentedProps<Value>): React.JSX.Element => {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingValueRef = useRef<Value | undefined>(undefined);

  useEffect((): void => {
    if (pendingValueRef.current !== value) return;

    pendingValueRef.current = undefined;
    const selectedIndex = options.findIndex((option) => option.value === value);
    optionRefs.current[selectedIndex]?.focus();
  }, [options, value]);

  function requestValue(nextValue: Value): void {
    if (nextValue !== value) pendingValueRef.current = nextValue;
    onChange(nextValue);
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`${styles.segmented} ${className ?? ''}`.trim()}
      role="radiogroup"
    >
      {options.map((option, index): React.JSX.Element => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            ref={(element): void => {
              optionRefs.current[index] = element;
            }}
            aria-checked={selected}
            className={`${selected ? styles.optionSelected : styles.option} ${optionClassName ?? ''}`.trim()}
            data-action-id={option.value}
            data-icon={option.value}
            data-segmented-value={option.value}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={(): void => requestValue(option.value)}
            onMouseDown={(event): void => {
              if (preserveSelection) event.preventDefault();
            }}
            onKeyDown={(event): void => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                requestValue(option.value);
                return;
              }

              const destination = nextIndex(index, options.length, event.key);
              if (destination === undefined) return;

              event.preventDefault();
              const nextOption = options[destination];
              if (nextOption !== undefined) requestValue(nextOption.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default Segmented;
