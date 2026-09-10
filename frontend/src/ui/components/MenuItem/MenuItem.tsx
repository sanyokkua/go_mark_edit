import type { ButtonHTMLAttributes } from 'react';

import styles from './MenuItem.module.css';

export interface MenuItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'role' | 'type'
> {
  readonly accelerator?: string;
  readonly checked?: boolean;
  readonly icon?: React.ReactNode;
  readonly label: React.ReactNode;
  readonly onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly radio?: boolean;
  readonly role?: 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' | 'radio';
  readonly submenu?: React.ReactNode;
  readonly trailing?: React.ReactNode;
}

/** One accessible, registry-ready row shared by every Popup consumer. */
const MenuItem: React.FC<MenuItemProps> = ({
  accelerator,
  checked,
  className,
  disabled = false,
  icon,
  label,
  onSelect,
  radio = false,
  role,
  submenu,
  trailing,
  ...rest
}: MenuItemProps): React.JSX.Element => {
  const itemRole =
    role ??
    (radio
      ? 'menuitemradio'
      : checked === undefined
        ? 'menuitem'
        : 'menuitemcheckbox');
  return (
    <button
      {...rest}
      aria-checked={checked}
      aria-disabled={disabled}
      className={`${styles.item} ${className ?? ''}`.trim()}
      data-state={
        checked === undefined ? undefined : checked ? 'checked' : 'unchecked'
      }
      data-shortcut={accelerator}
      data-disabled={disabled ? '' : undefined}
      disabled={disabled}
      role={itemRole}
      type="button"
      onClick={onSelect}
      onKeyDown={(event): void => {
        rest.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.currentTarget.click();
      }}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" className={styles.icon}>
          {icon}
        </span>
      )}
      <span className={styles.label}>{label}</span>
      {trailing}
      {accelerator === undefined ? null : (
        <span aria-hidden="true" className={styles.accelerator}>
          {accelerator}
        </span>
      )}
      {submenu === undefined ? null : (
        <span className={styles.submenu}>{submenu}</span>
      )}
    </button>
  );
};

export default MenuItem;
