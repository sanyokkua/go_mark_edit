import {
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type ForwardedRef,
} from 'react';

import Icon, { type IconName } from '../Icon';
import { OverflowMenuContext } from '../overflowMenuContext';
import styles from './ToolButton.module.css';

export type ToolButtonVariant = 'icon' | 'text';

export interface ToolButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type' | 'onClick' | 'aria-checked' | 'aria-pressed'
> {
  readonly checked?: boolean;
  readonly icon?: IconName;
  readonly label: string;
  readonly onActivate?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly pressed?: boolean;
  readonly preserveSelection?: boolean;
  readonly variant: ToolButtonVariant;
}

const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(
  function ToolButton(
    {
      checked,
      className,
      disabled = false,
      icon,
      label,
      onActivate,
      onMouseDown,
      preserveSelection = true,
      pressed,
      role,
      variant,
      ...rest
    }: ToolButtonProps,
    ref: ForwardedRef<HTMLButtonElement>,
  ): React.JSX.Element {
    const iconOnly = variant === 'icon' && icon !== undefined;
    const overflowMenu = useContext(OverflowMenuContext);
    return (
      <button
        {...rest}
        ref={ref}
        aria-checked={checked}
        aria-label={label}
        aria-pressed={pressed}
        className={`${styles.button} ${
          variant === 'icon' ? styles.icon : styles.text
        } ${iconOnly ? styles.iconOnly : ''} ${className ?? ''}`.trim()}
        data-tool-button-variant={variant}
        disabled={disabled}
        role={role ?? (overflowMenu ? 'menuitem' : undefined)}
        type="button"
        onClick={onActivate}
        onMouseDown={(event): void => {
          if (!disabled && preserveSelection) event.preventDefault();
          onMouseDown?.(event);
        }}
      >
        {icon === undefined ? null : <Icon name={icon} size={15} />}
        {variant === 'text' || icon === undefined ? label : null}
      </button>
    );
  },
);

export default ToolButton;
