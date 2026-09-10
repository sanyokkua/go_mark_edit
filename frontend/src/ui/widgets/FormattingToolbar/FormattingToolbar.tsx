import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
} from 'react';

import { t } from '../../../i18n';
import { useEditingProjection } from '../../../logic/hooks/useEditingProjection';
import {
  getAction,
  getActionAvailability,
  actionsForSurface,
  type ActionEntry,
  type ProjectedActionState,
} from '../../../logic/actions/actionRegistry';
import { dispatchAction } from '../../../logic/actions/actionDispatcher';
import {
  currentPlatform,
  formatShortcut,
  shortcutForKeyEvent,
} from '../../../logic/actions/shortcutRegistry';
import {
  formatMarkers,
  formatActionIds,
  runFormatAction,
} from '../../../logic/format/formatting';
import { DocumentCommandContext, EditorSessionContext } from '../editorSession';
import type { ViewArrangement } from '../../../logic/store/appModelTypes';
import { useEditorSettings } from '../../../logic/settings/editorSettings';
import type { IconName } from '../../primitives/Icon';
import Bar from '../../components/Bar';
import Island from '../../components/Island';
import MenuItem from '../../components/MenuItem';
import { PopupSeparator } from '../../components/Popup';
import Segmented, { type SegmentedOption } from '../../primitives/Segmented';
import ToolButton from '../../primitives/ToolButton';
import styles from './FormattingToolbar.module.css';
import { useModalState } from '../modalStateContext';
import { ApplicationMenuRequestContext } from '../applicationMenuRequest';

export interface FormattingToolbarProps {
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
const arrangementOptions: readonly SegmentedOption<ViewArrangement>[] =
  arrangementValues.map((value) => ({
    label: t(action(value).accessibilityKey),
    value,
  }));

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
    getActionAvailability(entry.id, { projectedState }).kind === 'unavailable';
  return (
    <ToolButton
      aria-label={t(entry.accessibilityKey)}
      className={styles.action}
      data-action-id={entry.id}
      data-icon={textualControlIds.has(entry.id) ? undefined : entry.id}
      disabled={unavailable}
      icon={
        textualControlIds.has(entry.id) ? undefined : (entry.id as IconName)
      }
      label={t(entry.accessibilityKey)}
      role={menuItem ? 'menuitem' : undefined}
      title={unavailable ? t('action.unavailable') : controlTooltip(entry)}
      variant={textualControlIds.has(entry.id) ? 'text' : 'icon'}
      onActivate={(): void => onActivate(entry)}
    />
  );
};

function actionButtons(
  ids: readonly ActionEntry['id'][],
  onActivate: (entry: ActionEntry) => void,
  className?: string,
  menuItem = false,
  overflowPriority?: number,
  neverOverflows = false,
): React.JSX.Element {
  return (
    <Island
      className={`${styles.group} ${className ?? ''}`}
      data-bar-overflow={neverOverflows ? 'never' : undefined}
      data-bar-overflow-priority={overflowPriority}
      label={ids.map((id) => t(action(id).labelKey)).join(', ')}
    >
      {ids.map((id) => (
        <ActionButton
          entry={action(id)}
          key={id}
          menuItem={menuItem}
          onActivate={onActivate}
        />
      ))}
    </Island>
  );
}

const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  arrangement,
  onArrangementChange,
}: FormattingToolbarProps): React.JSX.Element => {
  const commands = useContext(DocumentCommandContext);
  const activeBuffer = useContext(EditorSessionContext);
  const toolbarProjection = useEditingProjection(activeBuffer?.documentId);
  const modalOpen = useModalState();
  const requestApplicationMenu = useContext(ApplicationMenuRequestContext);
  const { markdownSettings } = useEditorSettings();
  const onActivate = useCallback(
    (entry: ActionEntry): void => {
      void dispatchAction(entry.id, {
        documentId: activeBuffer?.documentId,
        editorFocused: commands !== null && activeBuffer !== null,
        projectedState: toolbarProjection,
        invoke: (): unknown =>
          runFormatAction({
            actionId: entry.id,
            commands,
            markers: formatMarkers(markdownSettings),
          }),
        sessionDocumentId: activeBuffer?.documentId,
        writable: activeBuffer !== null,
      });
    },
    [activeBuffer, commands, markdownSettings, toolbarProjection],
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
      const availability = getActionAvailability(entry.id, {
        modalOpen,
        projectedState: toolbarProjection,
      });
      if (
        availability.kind !== 'available' &&
        availability.reason !== 'deferred'
      ) {
        return;
      }
      event.preventDefault();
      onActivate(entry);
    },
    [commands, modalOpen, onActivate, toolbarProjection],
  );

  useEffect((): (() => void) => {
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <ToolbarProjectionContext.Provider value={toolbarProjection}>
      <Bar
        ariaLabel={t('editor.toolbar')}
        className={styles.toolbar}
        main={
          <>
            {actionButtons(
              textActions.map((id) => action(id).id),
              onActivate,
              undefined,
              false,
              200,
            )}
            {actionButtons(
              headingActions.map((id) => action(id).id),
              onActivate,
              undefined,
              false,
              200,
            )}
            {actionButtons(
              listActions.map((id) => action(id).id),
              onActivate,
              undefined,
              false,
              400,
            )}
            {actionButtons(
              insertActions.map((id) => action(id).id),
              onActivate,
              undefined,
              false,
              400,
            )}
            {actionButtons(
              deferredActions.map((id) => action(id).id),
              onActivate,
              undefined,
              false,
              0,
              true,
            )}
          </>
        }
        overflow="menu"
        overflowBreakpoint={768}
        overflowLabel={t('editor.moreActions')}
        overflowPopupLabel={t('editor.moreActions')}
        overflowPopupClassName={styles.overflowContent}
        overflowPopupProps={{ 'data-viewport-popup': 'editor-overflow' }}
        overflowTriggerClassName={styles.overflowTrigger}
        role="toolbar"
        trailing={
          <Island
            className={`${styles.group} ${styles.arrangement}`}
            data-toolbar-arrangement="true"
            label={t('editor.arrangement')}
          >
            <Segmented
              ariaLabel={t('editor.arrangement')}
              className={styles.overflowArrangement}
              onChange={onArrangementChange}
              optionClassName={styles.action}
              options={arrangementOptions}
              preserveSelection={false}
              value={arrangement}
            />
          </Island>
        }
        overflowContent={
          <div className={styles.applicationOverflowItems}>
            {(['file', 'settings', 'view', 'about'] as const).map(
              (target, index) => (
                <Fragment key={target}>
                  {index === 0 ? <PopupSeparator /> : null}
                  <MenuItem
                    data-application-overflow-action={target}
                    label={applicationOverflowLabels[target]}
                    onSelect={(): void => requestApplicationMenu(target)}
                  />
                </Fragment>
              ),
            )}
          </div>
        }
      />
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
 * running platform, the same single source `Menubar`, `SettingsMenu` and
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

export default FormattingToolbar;
