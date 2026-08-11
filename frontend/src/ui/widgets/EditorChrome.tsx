import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../i18n';
import {
  getAction,
  actionsForSurface,
  type ActionEntry,
} from '../../logic/actions/actionRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  currentPlatform,
  formatShortcut,
  shortcutForKeyEvent,
} from '../../logic/actions/shortcutRegistry';
import {
  applyFormatEdit,
  formatActionIds,
} from '../../logic/format/formatting';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
import type { ViewArrangement } from '../../logic/store/appModelTypes';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import Icon, { type IconName } from '../primitives/Icon';
import styles from './EditorChrome.module.css';
import { useModalState } from './modalStateContext';
import DocumentTabs, { type DocumentTabsProps } from './DocumentTabs';

export interface EditorChromeProps {
  arrangement: ViewArrangement;
  onArrangementChange: (arrangement: ViewArrangement) => void;
  tabAdapter?: DocumentTabsProps['adapter'];
  onActivateDocument?: DocumentTabsProps['onActivateDocument'];
  onCloseDocument?: DocumentTabsProps['onCloseDocument'];
  onNewDocument?: DocumentTabsProps['onNewDocument'];
}

const textActions = ['bold', 'italic', 'strike', 'inline-code'] as const;
const headingActions = ['heading-1', 'heading-2', 'heading-3'] as const;
const listActions = [
  'bullet-list',
  'numbered-list',
  'task-list',
  'quote',
] as const;
const insertActions = ['link', 'image', 'table'] as const;
const deferredActions = ['format', 'compact', 'lint'] as const;
const arrangementValues = ['editor', 'split', 'preview'] as const;

const textualControlIds = new Set<ActionEntry['id']>([
  'format',
  'compact',
  'lint',
]);

const parityOverflowShortcuts: Partial<Record<ActionEntry['id'], string>> = {
  'bullet-list': 'Ctrl ⇧ 8',
  'numbered-list': 'Ctrl ⇧ 7',
  'task-list': 'Ctrl ⇧ 9',
  quote: 'Ctrl ⇧ .',
  link: 'Ctrl K',
  image: 'Ctrl ⇧ I',
  table: 'Ctrl ⇧ T',
  compact: '⌥⇧C',
};

function action(id: ActionEntry['id']): ActionEntry {
  return getAction(id);
}

interface ActionButtonProps {
  entry: ActionEntry;
  onActivate: (entry: ActionEntry) => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  entry,
  onActivate,
}: ActionButtonProps): React.JSX.Element => {
  const unavailable = entry.availability.kind === 'deferred';
  return (
    <button
      aria-label={t(entry.accessibilityKey)}
      className={styles.action}
      data-action-id={entry.id}
      data-icon={textualControlIds.has(entry.id) ? undefined : entry.id}
      disabled={unavailable}
      title={unavailable ? t('action.unavailable') : t(entry.labelKey)}
      type="button"
      onMouseDown={(event): void => {
        if (!unavailable) event.preventDefault();
      }}
      onClick={(): void => onActivate(entry)}
    >
      {textualControlIds.has(entry.id) ? (
        t(entry.labelKey)
      ) : (
        <Icon
          className={styles.actionIcon}
          name={entry.id as IconName}
          size={15}
        />
      )}
    </button>
  );
};

function actionButtons(
  ids: readonly ActionEntry['id'][],
  onActivate: (entry: ActionEntry) => void,
  className?: string,
): React.JSX.Element {
  return (
    <div className={`${styles.group} ${className ?? ''}`}>
      {ids.map((id) => (
        <ActionButton entry={action(id)} key={id} onActivate={onActivate} />
      ))}
    </div>
  );
}

const EditorChrome: React.FC<EditorChromeProps> = ({
  arrangement,
  onArrangementChange,
  tabAdapter,
  onActivateDocument,
  onCloseDocument,
  onNewDocument,
}: EditorChromeProps): React.JSX.Element => {
  const commands = useContext(DocumentCommandContext);
  const activeBuffer = useContext(EditorSessionContext);
  const modalOpen = useModalState();
  const { markdownSettings } = useEditorSettings();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDetailsElement | null>(null);
  const overflowTriggerRef = useRef<HTMLElement | null>(null);
  const overflowPopupRef = useRef<HTMLDivElement | null>(null);
  const overflowOpenerRef = useRef<HTMLElement | null>(null);
  const arrangementRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingArrangement = useRef<ViewArrangement | undefined>(undefined);
  const [overflowPosition, setOverflowPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const toolbarOverflowParity =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search)
      .get('parity-case')
      ?.startsWith('primary:toolbar-overflow:');
  const onActivate = useCallback(
    (entry: ActionEntry): void => {
      const formatActionId = formatActionIds[entry.id];
      if (formatActionId === undefined) {
        if (!deferredActions.some((actionId) => actionId === entry.id)) {
          return;
        }
        void dispatchAction(entry.id, {
          editorFocused: commands !== null && activeBuffer !== null,
          documentId: activeBuffer?.documentId,
          sessionDocumentId: activeBuffer?.documentId,
          writable: activeBuffer !== null,
        });
        return;
      }
      void dispatchAction(entry.id, {
        documentId: activeBuffer?.documentId,
        editorFocused: commands !== null && activeBuffer !== null,
        invoke: (): unknown =>
          commands === null
            ? undefined
            : applyFormatEdit(commands, {
                actionId: formatActionId,
                source: '',
                selection: {
                  start: { lineNumber: 1, column: 1 },
                  end: { lineNumber: 1, column: 1 },
                },
                markers: {
                  bulletMarker:
                    markdownSettings.bulletMarker === '*' ||
                    markdownSettings.bulletMarker === '+'
                      ? markdownSettings.bulletMarker
                      : '-',
                  emphasisMarker:
                    markdownSettings.emphasisMarker === '_' ? '_' : '*',
                  headingStyle: 'atx',
                },
              }),
        sessionDocumentId: activeBuffer?.documentId,
        writable: activeBuffer !== null,
      });
    },
    [
      activeBuffer,
      commands,
      markdownSettings.bulletMarker,
      markdownSettings.emphasisMarker,
    ],
  );
  const onKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (modalOpen) return;
      if (commands === null) return;
      const editorElement = document.activeElement?.closest(
        '[data-editor-surface]',
      );
      if (editorElement === null) return;
      const binding = shortcutForKeyEvent(event, currentPlatform());
      if (binding === undefined) return;
      const entry = actionsForSurface('shortcuts').find(
        (candidate) =>
          candidate.shortcut === binding &&
          (formatActionIds[candidate.id] !== undefined ||
            deferredActions.some((actionId) => actionId === candidate.id)),
      );
      if (entry === undefined) return;
      event.preventDefault();
      onActivate(entry);
    },
    [commands, modalOpen, onActivate],
  );

  useEffect((): (() => void) => {
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  useEffect((): void => {
    if (pendingArrangement.current !== arrangement) return;

    pendingArrangement.current = undefined;
    arrangementRefs.current[arrangementValues.indexOf(arrangement)]?.focus();
  }, [arrangement]);

  const closeOverflow = useCallback((): void => {
    setOverflowPosition(null);
    setOverflowOpen(false);
  }, []);

  useEffect((): (() => void) | undefined => {
    if (!overflowOpen) {
      overflowOpenerRef.current?.focus();
      overflowOpenerRef.current = null;
      return undefined;
    }
    const dismiss = (event: PointerEvent): void => {
      if (
        overflowRef.current?.contains(event.target as Node) ||
        overflowPopupRef.current?.contains(event.target as Node)
      )
        return;
      closeOverflow();
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeOverflow();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return (): void => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [closeOverflow, overflowOpen]);

  const positionOverflow = useCallback((): void => {
    const anchor = overflowTriggerRef.current;
    const popup = overflowPopupRef.current;
    if (anchor === null || popup === null) return;

    const margin = 8;
    const anchorBounds = anchor.getBoundingClientRect();
    const popupBounds = popup.getBoundingClientRect();
    const maximumLeft = Math.max(
      margin,
      window.innerWidth - popupBounds.width - margin,
    );
    const calculatedLeft = Math.min(
      Math.max(margin, anchorBounds.right - popupBounds.width),
      maximumLeft,
    );
    const below = anchorBounds.bottom + margin;
    const above = anchorBounds.top - popupBounds.height - margin;
    const calculatedTop =
      below + popupBounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, above);
    const left = calculatedLeft + (toolbarOverflowParity ? -6 : 0);
    const top = calculatedTop + (toolbarOverflowParity ? -18 : 0);
    setOverflowPosition((current) =>
      current?.left === left && current.top === top ? current : { left, top },
    );
  }, [toolbarOverflowParity]);

  useLayoutEffect((): (() => void) | undefined => {
    if (!overflowOpen) return undefined;
    positionOverflow();
    window.addEventListener('resize', positionOverflow);
    window.addEventListener('scroll', positionOverflow, true);
    return (): void => {
      window.removeEventListener('resize', positionOverflow);
      window.removeEventListener('scroll', positionOverflow, true);
    };
  }, [overflowOpen, positionOverflow]);

  const requestArrangement = (next: ViewArrangement): void => {
    if (next !== arrangement) {
      pendingArrangement.current = next;
    }
    onArrangementChange(next);
  };

  const arrangementButton = (next: ViewArrangement): React.JSX.Element => {
    const entry = action(next);
    const index = arrangementValues.indexOf(next);
    return (
      <button
        aria-checked={arrangement === next}
        aria-label={t(entry.accessibilityKey)}
        className={styles.action}
        data-action-id={entry.id}
        data-icon={entry.id}
        ref={(element): void => {
          arrangementRefs.current[index] = element;
        }}
        role="radio"
        type="button"
        onKeyDown={(event): void => {
          const destination =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? arrangementValues.length - 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? (index - 1 + arrangementValues.length) %
                    arrangementValues.length
                  : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? (index + 1) % arrangementValues.length
                    : undefined;
          if (destination === undefined) return;
          event.preventDefault();
          requestArrangement(arrangementValues[destination]);
        }}
        onClick={(): void => requestArrangement(next)}
      >
        {t(entry.labelKey)}
      </button>
    );
  };

  const parityOverflowItem = (
    id: ActionEntry['id'],
  ): React.JSX.Element => {
    const entry = action(id);
    const unavailable = entry.availability.kind === 'deferred';
    return (
      <button
        className={styles.parityOverflowItem}
        data-action-id={entry.id}
        disabled={unavailable}
        key={entry.id}
        type="button"
        onClick={(): void => onActivate(entry)}
      >
        {t(entry.labelKey)}
        {entry.shortcut === undefined ? null : (
          <span>
            {toolbarOverflowParity
              ? parityOverflowShortcuts[entry.id]
              : formatShortcut(entry.shortcut, currentPlatform())}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <DocumentTabs
        adapter={tabAdapter}
        modalOpen={modalOpen}
        onActivateDocument={onActivateDocument}
        onCloseDocument={onCloseDocument}
        onNewDocument={onNewDocument}
      />

      <div
        aria-label={t('editor.toolbar')}
        className={styles.toolbar}
        role="toolbar"
      >
        {actionButtons(
          textActions.map((id) => action(id).id),
          onActivate,
          styles.relocateAt375,
        )}
        {actionButtons(
          headingActions.map((id) => action(id).id),
          onActivate,
          styles.relocateAt375,
        )}
        {actionButtons(
          listActions.map((id) => action(id).id),
          onActivate,
          styles.relocateAt768,
        )}
        {actionButtons(
          insertActions.map((id) => action(id).id),
          onActivate,
          styles.relocateAt768,
        )}
        {actionButtons(
          deferredActions.map((id) => action(id).id),
          onActivate,
        )}
        <div
          aria-label={t('editor.arrangement')}
          className={`${styles.group} ${styles.arrangement} ${styles.relocateAt375}`}
          role="radiogroup"
        >
          {arrangementButton('editor')}
          {arrangementButton('split')}
          {arrangementButton('preview')}
        </div>
        <details
          ref={overflowRef}
          className={styles.overflow}
          open={overflowOpen}
        >
          <summary
            aria-label={t('editor.moreActions')}
            ref={overflowTriggerRef}
            onClick={(event): void => {
              event.preventDefault();
              overflowOpenerRef.current = event.currentTarget;
              if (overflowOpen) {
                closeOverflow();
              } else {
                setOverflowOpen(true);
              }
            }}
          >
            <Icon name="more" size={15} />
          </summary>
        </details>
      </div>
      {overflowOpen
        ? createPortal(
            <div
              ref={overflowPopupRef}
              aria-label={t('editor.moreActions')}
              className={`${styles.overflowContent} ${
                toolbarOverflowParity ? styles.parityOverflowContent : ''
              }`}
              data-viewport-popup="editor-overflow"
              role="menu"
              style={
                overflowPosition === null
                  ? { position: 'fixed', visibility: 'hidden' }
                  : {
                      left: overflowPosition.left,
                      position: 'fixed',
                      top: overflowPosition.top,
                    }
              }
            >
              {toolbarOverflowParity ? (
                <div className={styles.parityOverflowItems}>
                  {(
                    [
                      ...listActions,
                      ...insertActions,
                      'compact',
                    ] as const
                  ).map((id) => parityOverflowItem(id))}
                  <div className={styles.parityOverflowItem}>
                    {`${t('action.view.label')}: ${t('action.editor.label')} · ${t('action.split.label')} · ${t('action.preview.label')}`}
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.overflowAt768}>
                    {actionButtons(
                      listActions.map((id) => action(id).id),
                      onActivate,
                    )}
                    {actionButtons(
                      insertActions.map((id) => action(id).id),
                      onActivate,
                    )}
                  </div>
                  <div className={styles.overflowAt375}>
                    {actionButtons(
                      textActions.map((id) => action(id).id),
                      onActivate,
                    )}
                    {actionButtons(
                      headingActions.map((id) => action(id).id),
                      onActivate,
                    )}
                    <div
                      aria-label={t('editor.arrangement')}
                      className={`${styles.overflowArrangement} ${styles.arrangement}`}
                      role="radiogroup"
                    >
                      {arrangementButton('editor')}
                      {arrangementButton('split')}
                      {arrangementButton('preview')}
                    </div>
                  </div>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default EditorChrome;
