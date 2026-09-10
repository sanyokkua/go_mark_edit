import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { t } from '../../i18n';
import { useEditingProjection } from '../../logic/hooks/useEditingProjection';
import {
  getAction,
  getActionAvailability,
  actionsForSurface,
  type ActionEntry,
  type ProjectedActionState,
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
import MenuItem from '../components/MenuItem';
import Popup, { PopupSeparator, PopupTrigger } from '../components/Popup';
import styles from './EditorChrome.module.css';
import { useModalState } from './modalStateContext';
import { isMinimumWindow } from './minimumWindow';
import DocumentTabs, { type DocumentTabsProps } from './DocumentTabs';
import { ApplicationMenuRequestContext } from './applicationMenuRequest';

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

const applicationOverflowLabels = {
  about: t('shell.about'),
  file: t('shell.file'),
  settings: t('shell.settings'),
  view: t('action.view.label'),
} as const;

/*
 * Deliberately the static read, not `useMinimumWindow`: this drives where the
 * overflow popup is portalled and positioned, and it is already resynchronized
 * by the toolbar's own resize listener below.
 */
const isNarrowToolbarViewport = isMinimumWindow;

function action(id: ActionEntry['id']): ActionEntry {
  return getAction(id);
}

/**
 * The active document, in the shape `getActionAvailability` reads.
 *
 * A context rather than a prop threaded through ten `actionButtons` call sites.
 * It exists so a toolbar button can *ask* the registry whether its command is
 * available instead of deciding for itself — `ActionButton` used to compute
 * `disabled` from the static `entry.availability.kind` alone, which cannot see
 * the document, so FR-FT-006's "Editing MUST be unavailable" was invisible here
 * and every formatting button stayed live on a file the backend refuses to
 * write. Re-deriving the capability rule locally is the `SettingsMenu` defect
 * AGENTS.md records; asking the registry is the fix. T178.
 */
const ToolbarProjectionContext = createContext<
  ProjectedActionState | undefined
>(undefined);

interface ActionButtonProps {
  entry: ActionEntry;
  menuItem?: boolean;
  onActivate: (entry: ActionEntry) => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  entry,
  menuItem = false,
  onActivate,
}: ActionButtonProps): React.JSX.Element => {
  const projectedState = useContext(ToolbarProjectionContext);
  /*
   * The static check stays first and unchanged, so a deferred action is still
   * deferred when no projection has arrived. The registry call only ever *adds*
   * a refusal, and with no `modalOpen`/tab context passed it can only fire the
   * capability rule — this widens the disabled set by exactly FR-FT-006 and
   * nothing else.
   */
  const unavailable =
    entry.availability.kind === 'deferred' ||
    (projectedState !== undefined &&
      getActionAvailability(entry.id, { projectedState }).kind ===
        'unavailable');
  return (
    <button
      aria-label={t(entry.accessibilityKey)}
      className={styles.action}
      data-action-id={entry.id}
      data-icon={textualControlIds.has(entry.id) ? undefined : entry.id}
      disabled={unavailable}
      role={menuItem ? 'menuitem' : undefined}
      title={unavailable ? t('action.unavailable') : controlTooltip(entry)}
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
  menuItem = false,
): React.JSX.Element {
  return (
    <div className={`${styles.group} ${className ?? ''}`}>
      {ids.map((id) => (
        <ActionButton
          entry={action(id)}
          key={id}
          menuItem={menuItem}
          onActivate={onActivate}
        />
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
  const toolbarProjection = useEditingProjection(activeBuffer?.documentId);
  const modalOpen = useModalState();
  const requestApplicationMenu = useContext(ApplicationMenuRequestContext);
  const { markdownSettings } = useEditorSettings();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowTrigger, setOverflowTrigger] =
    useState<HTMLButtonElement | null>(null);
  const arrangementRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingArrangement = useRef<ViewArrangement | undefined>(undefined);
  const [narrowToolbarOverflow, setNarrowToolbarOverflow] = useState(
    isNarrowToolbarViewport,
  );
  useEffect((): (() => void) => {
    const onResize = (): void =>
      setNarrowToolbarOverflow(isNarrowToolbarViewport());
    window.addEventListener('resize', onResize);
    return (): void => window.removeEventListener('resize', onResize);
  }, []);
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
          projectedState: toolbarProjection,
          sessionDocumentId: activeBuffer?.documentId,
          writable: activeBuffer !== null,
        });
        return;
      }
      void dispatchAction(entry.id, {
        documentId: activeBuffer?.documentId,
        editorFocused: commands !== null && activeBuffer !== null,
        projectedState: toolbarProjection,
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
      toolbarProjection,
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

  const closeOverflow = (): void => {
    setOverflowOpen(false);
  };

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

  return (
    <ToolbarProjectionContext.Provider value={toolbarProjection}>
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
        <div className={styles.overflow}>
          <PopupTrigger
            aria-label={t('editor.moreActions')}
            className={styles.overflowTrigger}
            ref={setOverflowTrigger}
            expanded={overflowOpen}
            onClick={(): void => {
              if (overflowOpen) closeOverflow();
              else setOverflowOpen(true);
            }}
            onOpen={(): void => setOverflowOpen(true)}
          >
            <Icon name="more" size={15} />
          </PopupTrigger>
        </div>
        {/* Binding source: mockup.html `.tsp` (:673). The arrangement segment
            follows the spacer, and the overflow trigger precedes it, so the
            segment sits against the toolbar's trailing edge. */}
        <div aria-hidden="true" className={styles.spacer} />
        <div
          aria-label={t('editor.arrangement')}
          className={`${styles.group} ${styles.arrangement} ${styles.relocateAt375}`}
          role="radiogroup"
        >
          {arrangementButton('editor')}
          {arrangementButton('split')}
          {arrangementButton('preview')}
        </div>
      </div>
      <Popup
        anchor={{ trigger: overflowTrigger }}
        aria-label={t('editor.moreActions')}
        className={
          styles.overflowContent +
          (narrowToolbarOverflow ? ' ' + styles.narrowOverflowContent : '')
        }
        data-viewport-popup="editor-overflow"
        initialFocus="first"
        open={overflowOpen}
        returnFocusTo={overflowTrigger}
        role="menu"
        size="menu"
        onOpenChange={setOverflowOpen}
      >
        <div className={styles.overflowAt768}>
          {actionButtons(
            listActions.map((id) => action(id).id),
            onActivate,
            undefined,
            true,
          )}
          {actionButtons(
            insertActions.map((id) => action(id).id),
            onActivate,
            undefined,
            true,
          )}
        </div>
        <div className={styles.overflowAt375}>
          {actionButtons(
            textActions.map((id) => action(id).id),
            onActivate,
            undefined,
            true,
          )}
          {actionButtons(
            headingActions.map((id) => action(id).id),
            onActivate,
            undefined,
            true,
          )}
          <div
            aria-label={t('editor.arrangement')}
            className={styles.overflowArrangement + ' ' + styles.arrangement}
            role="radiogroup"
          >
            {arrangementButton('editor')}
            {arrangementButton('split')}
            {arrangementButton('preview')}
          </div>
        </div>
        <div className={styles.applicationOverflowItems}>
          {(['file', 'settings', 'view', 'about'] as const).map(
            (target, index) => (
              <Fragment key={target}>
                {index === 0 ? <PopupSeparator /> : null}
                <MenuItem
                  data-application-overflow-action={target}
                  label={applicationOverflowLabels[target]}
                  onSelect={(): void => {
                    requestApplicationMenu(target);
                    closeOverflow();
                  }}
                />
              </Fragment>
            ),
          )}
        </div>
      </Popup>
    </ToolbarProjectionContext.Provider>
  );
};

/*
 * T190. The tooltip is where an icon-first control advertises its accelerator.
 *
 * These buttons carry an icon and a localized accessible name, so unlike the
 * shell's text menus there is no row to put an accelerator beside — the tooltip
 * is the surface that answers "what is this, and how do I reach it from the
 * keyboard". The binding comes from the action registry and is formatted for the
 * running platform, the same single source `ShellMenuRow`, `SettingsMenu` and
 * `TabContextMenu` use.
 *
 * A control with no binding keeps its plain label rather than gaining an empty
 * bracket.
 */
function controlTooltip(entry: ActionEntry): string {
  const label = t(entry.labelKey);
  const binding = entry.shortcut;
  return binding === undefined
    ? label
    : `${label} (${formatShortcut(binding, currentPlatform())})`;
}

export default EditorChrome;
