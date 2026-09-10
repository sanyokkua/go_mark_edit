import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './ModalShell.module.css';

const focusableSelector = [
  'button:not([disabled]):not([tabindex="-1"])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export type ModalFocusTarget =
  HTMLElement | null | RefObject<HTMLElement | null> | undefined;

export interface ModalShellProps {
  readonly children: React.ReactNode;
  readonly dismiss: 'backdrop' | 'escape' | 'none';
  readonly initialFocus?: ModalFocusTarget;
  readonly onRequestClose: () => void;
  readonly open: boolean;
  readonly returnFocusTo?: ModalFocusTarget;
  readonly title: string;
  readonly width?: CSSProperties['width'];
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
}

function resolveFocusTarget(target: ModalFocusTarget): HTMLElement | null {
  if (target === null || target === undefined) return null;
  return 'current' in target ? target.current : target;
}

const ModalShell: React.FC<ModalShellProps> = ({
  children,
  dismiss,
  initialFocus,
  onRequestClose,
  open,
  returnFocusTo,
  title,
  width,
}: ModalShellProps): React.JSX.Element | null => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const closeRef = useRef(onRequestClose);

  useEffect((): void => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);

  const restoreFocus = useCallback((): void => {
    const target = resolveFocusTarget(returnFocusTo) ?? openerRef.current;
    openerRef.current = null;
    if (target?.isConnected === true) target.focus();
  }, [returnFocusTo]);

  useLayoutEffect((): void => {
    if (!open) return;

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    const dialog = dialogRef.current;
    if (dialog === null) return;
    const target = resolveFocusTarget(initialFocus) ?? dialog;
    target.focus();
  }, [initialFocus, open]);

  useEffect((): (() => void) | undefined => {
    if (open) return undefined;
    if (!wasOpenRef.current) return undefined;

    wasOpenRef.current = false;
    restoreFocus();
    return undefined;
  }, [open, restoreFocus]);

  useEffect(
    (): (() => void) => (): void => {
      if (!wasOpenRef.current) return;
      wasOpenRef.current = false;
      restoreFocus();
    },
    [restoreFocus],
  );

  useEffect((): (() => void) | undefined => {
    if (!open || dismiss === 'none') return undefined;

    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return (): void =>
      document.removeEventListener('keydown', onDocumentKeyDown);
  }, [dismiss, open]);

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

      const focusTarget = resolveFocusTarget(initialFocus) ?? dialog;
      focusTarget.focus();
    };
    document.addEventListener('focusin', keepFocusInside);
    return (): void => document.removeEventListener('focusin', keepFocusInside);
  }, [initialFocus, open]);

  const trapFocus = useCallback((event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (dialog === null) return;

    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    );
    event.preventDefault();
    if (currentIndex < 0) {
      (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus();
      return;
    }

    const nextIndex =
      (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) %
      focusable.length;
    focusable[nextIndex]?.focus();
  }, []);

  useEffect((): (() => void) | undefined => {
    if (!open) return undefined;

    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') return;
      trapFocus(event);
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return (): void =>
      document.removeEventListener('keydown', onDocumentKeyDown);
  }, [open, trapFocus]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className={styles.overlay}
        data-modal-backdrop
        data-testid="modal-backdrop"
        onPointerDown={(event): void => {
          if (dismiss === 'backdrop' && event.target === event.currentTarget) {
            closeRef.current();
          }
        }}
      />
      <section
        ref={dialogRef}
        aria-labelledby="modal-shell-title"
        aria-modal="true"
        className={styles.content}
        data-modal-shell
        role="dialog"
        style={width === undefined ? undefined : { width }}
        tabIndex={-1}
      >
        <h1 className={styles.title} id="modal-shell-title">
          {title}
        </h1>
        {children}
      </section>
    </>,
    document.body,
  );
};

export default ModalShell;
