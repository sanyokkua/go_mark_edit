import React, { forwardRef } from 'react';

import menu from './MenuSurface.module.css';

export interface MenuTriggerProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-expanded' | 'aria-haspopup' | 'type'
> {
  /** Whether this trigger's menu is open. Drives `aria-expanded` and, through
   *  it, the binding's open styling. */
  readonly expanded: boolean;
  /** Called for the keyboard openers the menubar shares: ArrowDown, Enter and
   *  Space. Click stays the caller's own, because each menu closes its siblings
   *  differently. */
  readonly onOpen?: (trigger: HTMLButtonElement) => void;
}

/*
 * The one owner of menubar trigger behaviour, beside `MenuSurface`'s ownership
 * of the popups those triggers open.
 *
 * File, Settings, View and About had three separate implementations between
 * them, which is how they came to disagree on hover styling, on the corner
 * radius, and on whether ArrowDown opens the menu at all. A button is the same
 * button whichever menu hangs off it, so the styling, the ARIA and the keyboard
 * contract live here once.
 *
 * Props are spread before this component's own so that Radix's
 * `DropdownMenu.Trigger asChild` can still inject onto the underlying button,
 * and the ref is forwarded for the same reason. `data-*` hooks the callers rely
 * on for tests and parity selectors pass straight through.
 */
const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(
  function MenuTrigger(
    { children, className, expanded, onKeyDown, onOpen, ...rest },
    ref,
  ): React.JSX.Element {
    return (
      <button
        {...rest}
        ref={ref}
        aria-expanded={expanded}
        aria-haspopup="menu"
        className={
          className === undefined || className.length === 0
            ? menu.trigger
            : `${menu.trigger} ${className}`
        }
        type="button"
        onKeyDown={(event): void => {
          onKeyDown?.(event);
          if (event.defaultPrevented) {
            return;
          }
          if (
            event.key !== 'ArrowDown' &&
            event.key !== 'Enter' &&
            event.key !== ' '
          ) {
            return;
          }
          event.preventDefault();
          onOpen?.(event.currentTarget);
        }}
      >
        {children}
      </button>
    );
  },
);

export default MenuTrigger;
