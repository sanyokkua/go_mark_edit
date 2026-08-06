import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { t } from '../../i18n';
import {
  getAction,
  actionsForSurface,
  type ActionEntry,
} from '../../logic/actions/actionRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  currentPlatform,
  shortcutForKeyEvent,
} from '../../logic/actions/shortcutRegistry';
import {
  applyFormatEdit,
  formatActionIds,
} from '../../logic/format/formatting';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
import type { ViewArrangement } from '../../logic/store/appModelTypes';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import styles from './EditorChrome.module.css';
import { useModalState } from './modalStateContext';

export interface EditorChromeProps {
  arrangement: ViewArrangement;
  onArrangementChange: (arrangement: ViewArrangement) => void;
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

function actionGlyph(id: ActionEntry['id']): string {
  const glyphs: Partial<Record<ActionEntry['id'], string>> = {
    bold: '𝐁',
    italic: '𝘐',
    strike: 'S̶',
    'inline-code': '</>',
    'heading-1': 'H1',
    'heading-2': 'H2',
    'heading-3': 'H3',
    'bullet-list': '•',
    'numbered-list': '1.',
    'task-list': '☑',
    quote: '❝',
    link: '↗',
    image: '▧',
    table: '▦',
    'toggle-sidebar': '☰',
    'toggle-assistant': '✦',
    editor: '▣',
    split: '▥',
    preview: '▤',
  };
  return glyphs[id] ?? '•';
}

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
        <span aria-hidden="true" className={styles.actionIcon}>
          {actionGlyph(entry.id)}
        </span>
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
}: EditorChromeProps): React.JSX.Element => {
  const commands = useContext(DocumentCommandContext);
  const activeBuffer = useContext(EditorSessionContext);
  const modalOpen = useModalState();
  const { markdownSettings } = useEditorSettings();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDetailsElement | null>(null);
  const overflowOpenerRef = useRef<HTMLElement | null>(null);
  const arrangementRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingArrangement = useRef<ViewArrangement | undefined>(undefined);
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

  useEffect((): (() => void) | undefined => {
    if (!overflowOpen) {
      overflowOpenerRef.current?.focus();
      overflowOpenerRef.current = null;
      return undefined;
    }
    const dismiss = (event: PointerEvent): void => {
      if (overflowRef.current?.contains(event.target as Node)) return;
      setOverflowOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOverflowOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return (): void => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [overflowOpen]);

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

  return (
    <div className={styles.chrome}>
      <div
        aria-label={t('editor.tabs')}
        className={styles.tabStrip}
        role="tablist"
      >
        <div className={styles.tabs}>
          {(['release-notes.md', 'spec-draft.md'] as const).map(
            (title, index) => (
              <div className={styles.tabItem} key={title}>
                <button
                  aria-selected={index === 0}
                  aria-label={title}
                  className={styles.tab}
                  disabled
                  role="tab"
                  type="button"
                >
                  {index === 0 ? (
                    <span
                      aria-label={t('editor.tab.modified')}
                      className={styles.modifiedDot}
                    >
                      •
                    </span>
                  ) : null}
                  {title}
                </button>
                <button
                  aria-label={t('editor.tab.close', { title })}
                  className={styles.tabClose}
                  disabled
                  type="button"
                >
                  ×
                </button>
              </div>
            ),
          )}
          <button
            aria-label={t('editor.tab.new')}
            className={styles.tabAdd}
            disabled
            type="button"
          >
            +
          </button>
        </div>
      </div>

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
          className={`${styles.group} ${styles.relocateAt375}`}
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
            onClick={(event): void => {
              event.preventDefault();
              overflowOpenerRef.current = event.currentTarget;
              setOverflowOpen((open) => !open);
            }}
          >
            »
          </summary>
          {overflowOpen ? (
            <div className={styles.overflowContent}>
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
                  className={styles.overflowArrangement}
                  role="radiogroup"
                >
                  {arrangementButton('editor')}
                  {arrangementButton('split')}
                  {arrangementButton('preview')}
                </div>
              </div>
            </div>
          ) : null}
        </details>
      </div>
    </div>
  );
};

export default EditorChrome;
