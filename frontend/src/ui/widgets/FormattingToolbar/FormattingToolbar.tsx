import { createContext, Fragment, useCallback, useContext } from 'react';

import { t } from '../../../i18n';
import { useEditingProjection } from '../../../logic/hooks/useEditingProjection';
import {
    getAction,
    getActionAvailability,
    actionUnavailableLabelKey,
    type ActionEntry,
    type ProjectedActionState,
} from '../../../logic/actions/actionRegistry';
import { currentPlatform, formatShortcut } from '../../../logic/actions/shortcutRegistry';
import { EditorSessionContext } from '../editorSession';
import type { ViewArrangement } from '../../../logic/store/appModelTypes';
import Icon, { type IconName } from '../../primitives/Icon';
import Bar from '../../components/Bar';
import Island from '../../components/Island';
import MenuItem from '../../components/MenuItem';
import { PopupSeparator } from '../../components/Popup';
import { OverflowMenuContext } from '../../primitives/overflowMenuContext';
import Segmented, { type SegmentedOption } from '../../primitives/Segmented';
import ToolButton from '../../primitives/ToolButton';
import styles from './FormattingToolbar.module.css';
import { ApplicationMenuRequestContext } from '../applicationMenuRequest';
import { useEditorActionExecutor } from '../useEditorActionExecutor';
import { useEditorSettings } from '../../../logic/settings/editorSettings';
import { useOperationSlot } from '../../../logic/operations/useOperationSlot';
import type { OperationSlotState } from '../../../logic/operations/operationSlot';
import { TidyCommandsContext } from '../tidyCommandsContext';

export interface FormattingToolbarProps {
    arrangement: ViewArrangement;
    onArrangementChange: (arrangement: ViewArrangement) => void;
}

const textActions = ['bold', 'italic', 'strike', 'inline-code'] as const;
const headingActions = ['heading-1', 'heading-2', 'heading-3'] as const;
const listActions = ['bullet-list', 'numbered-list', 'task-list', 'quote'] as const;
const insertActions = ['link', 'image', 'table'] as const;
const tidyActions = ['format', 'compact', 'lint'] as const;
const arrangementValues = ['editor', 'split', 'preview'] as const;
const arrangementOptions: readonly SegmentedOption<ViewArrangement>[] = arrangementValues.map((value) => ({
    label: t(action(value).accessibilityKey),
    value,
}));

const textualControlIds = new Set<ActionEntry['id']>(['format', 'compact', 'lint']);

const applicationOverflowLabels = {
    about: t('shell.about'),
    file: t('shell.file'),
    format: t('shell.format'),
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
 * the document, so the editing capability was invisible here
 * and every formatting button stayed live on a file the backend refuses to
 * write. Re-deriving the capability rule locally is the `SettingsMenu` defect
 * AGENTS.md records; asking the registry is the fix.
 */
const ToolbarProjectionContext = createContext<{
    projectedState?: ProjectedActionState;
    markdownSettingsLoaded: boolean;
    slot: OperationSlotState;
    cancel?: () => void;
}>({ markdownSettingsLoaded: true, slot: { state: 'idle' } });

interface ActionButtonProps {
    entry: ActionEntry;
    onActivate: (entry: ActionEntry) => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({ entry, onActivate }: ActionButtonProps): React.JSX.Element => {
    const { projectedState, markdownSettingsLoaded, slot, cancel } = useContext(ToolbarProjectionContext);
    const overflowMenu = useContext(OverflowMenuContext);
    const availability = getActionAvailability(entry.id, {
        projectedState,
        markdownSettingsLoaded,
        slotBusy: slot.state === 'running',
    });
    const unavailable = availability.kind === 'unavailable';
    const icon = textualControlIds.has(entry.id) ? undefined : (entry.id as IconName);
    const cancellable = slot.state === 'running' && slot.progress !== null && slot.kind === entry.id;
    const progress = slot.state === 'running' ? slot.progress : null;
    if (overflowMenu) {
        const binding = entry.shortcut;
        return (
            <MenuItem
                accelerator={binding === undefined ? undefined : formatShortcut(binding, currentPlatform())}
                data-action-id={entry.id}
                data-icon={icon === undefined ? undefined : entry.id}
                disabled={cancellable ? false : unavailable}
                icon={icon === undefined ? undefined : <Icon name={icon} />}
                label={cancellable ? t('tidy.cancel') : t(entry.labelKey)}
                title={
                    cancellable
                        ? t('tidy.running')
                        : unavailable
                          ? t(actionUnavailableLabelKey(availability.reason))
                          : undefined
                }
                trailing={cancellable && progress !== null ? `${progress.done}/${progress.total}` : undefined}
                onMouseDown={(event): void => {
                    if (!unavailable) event.preventDefault();
                }}
                onSelect={(): void => (cancellable ? cancel?.() : onActivate(entry))}
            />
        );
    }
    return cancellable ? (
        <span className={styles.runningControl}>
            <ToolButton
                aria-label={t('tidy.cancel')}
                className={styles.action}
                data-action-id={entry.id}
                label={t('tidy.cancel')}
                title={t('tidy.running')}
                variant="text"
                onActivate={cancel}
            />
            <span role="status" aria-label={t('tidy.running')} className={styles.progress}>
                {progress?.done}/{progress?.total}
            </span>
        </span>
    ) : (
        <ToolButton
            aria-label={t(entry.accessibilityKey)}
            className={styles.action}
            data-action-id={entry.id}
            data-icon={icon === undefined ? undefined : entry.id}
            disabled={unavailable}
            icon={icon}
            label={t(entry.accessibilityKey)}
            title={unavailable ? t(actionUnavailableLabelKey(availability.reason)) : controlTooltip(entry)}
            variant={textualControlIds.has(entry.id) ? 'text' : 'icon'}
            onActivate={(): void => onActivate(entry)}
        />
    );
};

function actionButtons(
    ids: readonly ActionEntry['id'][],
    onActivate: (entry: ActionEntry) => void,
    className?: string,
    overflowPriority?: number,
    neverOverflows = false,
): React.JSX.Element {
    return (
        <ActionGroup
            className={className}
            ids={ids}
            neverOverflows={neverOverflows}
            overflowPriority={overflowPriority}
            onActivate={onActivate}
        />
    );
}

interface ActionGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'aria-label'> {
    className?: string;
    ids: readonly ActionEntry['id'][];
    neverOverflows: boolean;
    onActivate: (entry: ActionEntry) => void;
    overflowPriority?: number;
}

const ActionGroup: React.FC<ActionGroupProps> = ({
    className,
    ids,
    neverOverflows,
    onActivate,
    overflowPriority,
    ...rest
}: ActionGroupProps): React.JSX.Element => {
    const overflowMenu = useContext(OverflowMenuContext);
    return (
        <Island
            {...rest}
            className={`${styles.group} ${overflowMenu ? styles.overflowGroup : ''} ${className ?? ''}`}
            data-bar-overflow={neverOverflows ? 'never' : undefined}
            data-bar-overflow-priority={overflowPriority}
            data-toolbar-overflow-group={overflowMenu ? 'true' : undefined}
            label={ids.map((id) => t(action(id).labelKey)).join(', ')}
        >
            {ids.map((id) => (
                <ActionButton entry={action(id)} key={id} onActivate={onActivate} />
            ))}
        </Island>
    );
};

const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
    arrangement,
    onArrangementChange,
}: FormattingToolbarProps): React.JSX.Element => {
    const activeBuffer = useContext(EditorSessionContext);
    const toolbarProjection = useEditingProjection(activeBuffer?.documentId);
    const { markdownSettings } = useEditorSettings();
    const slot = useOperationSlot();
    const tidyCommands = useContext(TidyCommandsContext);
    const requestApplicationMenu = useContext(ApplicationMenuRequestContext);
    const { execute } = useEditorActionExecutor({ registerShortcuts: true });
    const onActivate = useCallback(
        (entry: ActionEntry): void => {
            void execute(entry.id);
        },
        [execute],
    );

    return (
        <ToolbarProjectionContext.Provider
            value={{
                projectedState: toolbarProjection,
                markdownSettingsLoaded: markdownSettings !== undefined,
                slot,
                cancel: tidyCommands === null ? undefined : () => tidyCommands.cancel(),
            }}
        >
            <Bar
                ariaLabel={t('editor.toolbar')}
                className={styles.toolbar}
                main={
                    <>
                        {actionButtons(
                            textActions.map((id) => action(id).id),
                            onActivate,
                            undefined,
                            200,
                        )}
                        {actionButtons(
                            headingActions.map((id) => action(id).id),
                            onActivate,
                            undefined,
                            200,
                        )}
                        {actionButtons(
                            listActions.map((id) => action(id).id),
                            onActivate,
                            undefined,
                            400,
                        )}
                        {actionButtons(
                            insertActions.map((id) => action(id).id),
                            onActivate,
                            undefined,
                            400,
                        )}
                        {actionButtons(
                            tidyActions.map((id) => action(id).id),
                            onActivate,
                            styles.utilityGroup,
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
                        {(['file', 'format', 'settings', 'view', 'about'] as const).map((target, index) => (
                            <Fragment key={target}>
                                {index === 0 ? <PopupSeparator /> : null}
                                <MenuItem
                                    data-application-overflow-action={target}
                                    label={applicationOverflowLabels[target]}
                                    onSelect={(): void => requestApplicationMenu(target)}
                                />
                            </Fragment>
                        ))}
                    </div>
                }
            />
        </ToolbarProjectionContext.Provider>
    );
};

/*
 * The tooltip is where an icon-first control advertises its accelerator.
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
    return binding === undefined ? label : `${label} (${formatShortcut(binding, currentPlatform())})`;
}

export default FormattingToolbar;
