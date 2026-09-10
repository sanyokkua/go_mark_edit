import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ForwardedRef,
} from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  readonly children: React.ReactNode;
  readonly variant: ButtonVariant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, disabled = false, variant, ...rest }: ButtonProps,
  ref: ForwardedRef<HTMLButtonElement>,
): React.JSX.Element {
  return (
    <button
      {...rest}
      ref={ref}
      className={`${styles.button} ${styles[variant]} ${className ?? ''}`.trim()}
      data-button-variant={variant}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
});

export default Button;
