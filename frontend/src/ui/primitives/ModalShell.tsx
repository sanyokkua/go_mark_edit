import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

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
  /**
   * The dialog's accessible name, rendered as its heading.
   *
   * One mechanism, deliberately. The section used to carry `aria-label={title}`
   * as well as `aria-labelledby`, and `aria-labelledby` wins wherever both are
   * present, so the label was inert on every dialog while reading like a
   * contract — which is how the T138 divergence stayed invisible. The heading
   * below is what names the dialog; nothing else does. T172.
   */
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

  const trapFocus = useCallback((event: React.KeyboardEvent): void => {
    // Escape is handled on the document instead — see the effect below.
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
  }, []);

  /*
   * Escape is bound to the document, not to the dialog. Clicking any
   * non-focusable area — the backdrop, or a gap between controls — moves focus
   * to <body> *without* firing `focusin`, so the `keepFocusInside` guard below
   * never runs and the dialog's own key handler stops receiving anything. The
   * box then cannot be dismissed from the keyboard at all, which is what was
   * observed on the built application.
   */
  const escapeRef = useRef(onEscape);
  useEffect((): void => {
    escapeRef.current = onEscape;
  }, [onEscape]);
  useEffect((): (() => void) | undefined => {
    if (!open) return undefined;
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      escapeRef.current();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return (): void =>
      document.removeEventListener('keydown', onDocumentKeyDown);
  }, [open]);

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

  /*
   * T138. One structure, on every route. This used to branch on
   * `?parity-case`: the backdrop became the dialog, the section had `role`,
   * `aria-modal` and `aria-label` forced to `undefined`, and at 376px or less
   * the whole thing portalled. FR-FT-054 lets the parity route seed data; it
   * does not let it render a different component, and stripping the
   * accessibility contract from the DOM the harness measures is worse than the
   * portalling — it means no measurement taken there described what ships.
   *
   * The portal survives, unconditionally, because it is the half that was
   * right: `.overlay` and `.content` are `position: fixed`, and a transformed
   * or filtered ancestor turns a fixed descendant into an absolute one against
   * that ancestor's box. Portalling to `document.body` keeps the modal owned by
   * the viewport whatever the shell does above it, which at the 375px minimum
   * window is the difference between a centred dialog and a clipped one.
   */
  return createPortal(
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
    </>,
    document.body,
  );
};

export default ModalShell;
