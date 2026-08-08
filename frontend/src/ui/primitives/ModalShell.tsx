import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';

import styles from './ModalShell.module.css';

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalShellProps {
  children: React.ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  labelledBy: string;
  onBackdrop: () => void;
  onEscape: () => void;
  open: boolean;
  title: string;
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
}

const ModalShell: React.FC<ModalShellProps> = ({
  children,
  initialFocusRef,
  labelledBy,
  onBackdrop,
  onEscape,
  open,
  title,
}: ModalShellProps): React.JSX.Element | null => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const originRef = useRef<HTMLElement | null>(null);

  useEffect(
    (): (() => void) => (): void => {
      const origin = originRef.current;
      originRef.current = null;
      if (origin?.isConnected === true) origin.focus();
    },
    [],
  );

  useLayoutEffect((): void => {
    if (!open) {
      const origin = originRef.current;
      originRef.current = null;
      if (origin?.isConnected === true) origin.focus();
      return;
    }
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (originRef.current === null) {
      originRef.current = document.activeElement as HTMLElement | null;
    }
    const initial = initialFocusRef?.current;
    (initial ?? focusableElements(dialog)[0] ?? dialog).focus();
  }, [initialFocusRef, open]);

  const trapFocus = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1) as HTMLElement;
      const currentIndex = focusable.indexOf(
        document.activeElement as HTMLElement,
      );
      if (currentIndex >= 0) {
        event.preventDefault();
        const nextIndex =
          (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) %
          focusable.length;
        focusable[nextIndex].focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onEscape],
  );

  useEffect((): (() => void) | undefined => {
    if (!open) return undefined;
    const keepFocusInside = (event: FocusEvent): void => {
      const dialog = dialogRef.current;
      const target = event.target;
      if (
        dialog === null ||
        !(target instanceof Node) ||
        dialog.contains(target)
      ) {
        return;
      }
      (
        initialFocusRef?.current ??
        focusableElements(dialog)[0] ??
        dialog
      ).focus();
    };
    document.addEventListener('focusin', keepFocusInside);
    return (): void => document.removeEventListener('focusin', keepFocusInside);
  }, [initialFocusRef, open]);

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.overlay}
        data-modal-backdrop
        onPointerDown={(event): void => {
          if (event.target === event.currentTarget) onBackdrop();
        }}
      />
      <section
        ref={dialogRef}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={styles.content}
        data-modal-shell
        role="dialog"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <h1 className={styles.title} id={labelledBy}>
          {title}
        </h1>
        {children}
      </section>
    </>
  );
};

export default ModalShell;
