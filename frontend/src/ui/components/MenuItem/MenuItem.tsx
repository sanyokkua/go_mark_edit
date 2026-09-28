import { forwardRef, type ButtonHTMLAttributes } from 'react';

import Icon from '../../primitives/Icon';
import styles from './MenuItem.module.css';

export interface MenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'role' | 'type'> {
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

/** Shared selection mark, also usable for rows that only report a value. */
export const MenuItemIndicator = ({ checked }: { readonly checked: boolean }): React.JSX.Element => (
    <span aria-hidden="true" className={styles.indicator}>
        {checked ? <Icon name="check" /> : null}
    </span>
);

/** One accessible, registry-ready row shared by every Popup consumer. */
const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(
    (
        {
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
        }: MenuItemProps,
        ref,
    ): React.JSX.Element => {
        const itemRole = role ?? (radio ? 'menuitemradio' : checked === undefined ? 'menuitem' : 'menuitemcheckbox');
        const indicator =
            trailing === undefined && checked !== undefined ? <MenuItemIndicator checked={checked} /> : trailing;
        return (
            <button
                {...rest}
                ref={ref}
                aria-checked={checked}
                aria-disabled={disabled}
                className={`${styles.item} ${className ?? ''}`.trim()}
                data-state={checked === undefined ? undefined : checked ? 'checked' : 'unchecked'}
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
                {indicator === undefined ? null : <span className={styles.trailing}>{indicator}</span>}
                {accelerator === undefined ? null : (
                    <span aria-hidden="true" className={styles.accelerator}>
                        {accelerator}
                    </span>
                )}
                {submenu === undefined ? null : <span className={styles.submenu}>{submenu}</span>}
            </button>
        );
    },
);

MenuItem.displayName = 'MenuItem';

export default MenuItem;
