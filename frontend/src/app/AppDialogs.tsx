import { useRef } from 'react';
import { t } from '../i18n';
import type { RecoverySurface } from '../logic/store/appModelTypes';
import Button from '../ui/primitives/Button';
import LiveRegion from '../ui/primitives/LiveRegion';
import ModalShell from '../ui/components/ModalShell';
import AboutDialog from '../ui/widgets/dialogs/AboutDialog';
import InsertTableDialog from '../ui/widgets/dialogs/InsertTableDialog';
import ShortcutsDialog from '../ui/widgets/dialogs/ShortcutsDialog';
import NormalizationPrompt from '../ui/widgets/dialogs/NormalizationPrompt';
import ExternalChangePrompt from '../ui/widgets/dialogs/ExternalChangePrompt';
import ClosePrompt from '../ui/widgets/dialogs/ClosePrompt';
import CloseFolderPrompt from '../ui/widgets/dialogs/CloseFolderPrompt';
import WorkspaceReplacePrompt from '../ui/widgets/dialogs/WorkspaceReplacePrompt';
import FolderDropPrompt from '../ui/widgets/dialogs/FolderDropPrompt';
import type { EditorActionSnapshot } from '../logic/actions/editorActionExecutor';
import type { WorkflowPrompts } from './useWorkflowPrompts';
import type { UseCommandsResult } from './useCommands';
import type { DropHandler } from './useDropHandler';

interface DialogVisibility {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
}
export interface AppDialogsProps {
    status: 'loading' | 'ready' | 'failed';
    version: string;
    about: DialogVisibility;
    shortcuts: DialogVisibility;
    table: { readonly snapshot: EditorActionSnapshot | null; readonly close: () => void };
    prompts: WorkflowPrompts;
    folderCommands: Pick<
        UseCommandsResult,
        'replaceFolderPath' | 'onReplaceFolderChoice' | 'closeFolderPromptOpen' | 'onCloseFolderChoice'
    >;
    drops: Pick<DropHandler, 'folderPaths' | 'onFolderChoice'>;
    recovery: RecoverySurface | null;
    announcement: string;
}

export function AppDialogs({
    status,
    version,
    about,
    shortcuts,
    table,
    prompts,
    folderCommands,
    drops,
    recovery,
    announcement,
}: AppDialogsProps): React.JSX.Element {
    const recoveryCancel = useRef<HTMLButtonElement | null>(null);
    const ready = status === 'ready';
    return (
        <>
            <AboutDialog open={ready && about.open} onOpenChange={about.onOpenChange} version={version} />
            <ShortcutsDialog open={ready && shortcuts.open} onOpenChange={shortcuts.onOpenChange} />
            <InsertTableDialog open={ready} snapshot={table.snapshot} onClose={table.close} />
            {prompts.normalization !== null ? (
                <NormalizationPrompt
                    key={prompts.normalization.id}
                    open={ready}
                    filename={prompts.normalization.filename}
                    proposedEnding={prompts.normalization.proposedEnding}
                    onConfirm={prompts.normalization.onConfirm}
                    onCancel={prompts.normalization.onCancel}
                />
            ) : null}
            {prompts.close !== null ? (
                <ClosePrompt
                    key={prompts.close.plan.id}
                    open={ready}
                    plan={prompts.close.plan}
                    onChoice={prompts.close.onChoice}
                />
            ) : null}
            <WorkspaceReplacePrompt
                open={ready && folderCommands.replaceFolderPath !== null}
                folderPath={folderCommands.replaceFolderPath ?? ''}
                onChoice={folderCommands.onReplaceFolderChoice}
            />
            <FolderDropPrompt
                open={ready && drops.folderPaths.length > 1}
                folderPaths={drops.folderPaths}
                onChoice={drops.onFolderChoice}
            />
            <CloseFolderPrompt
                open={ready && folderCommands.closeFolderPromptOpen}
                onChoice={folderCommands.onCloseFolderChoice}
            />
            {prompts.conflict !== null ? (
                <ExternalChangePrompt
                    key={prompts.conflict.id}
                    open={ready}
                    preview={prompts.conflict.preview}
                    valid={prompts.conflict.valid}
                    onDecision={prompts.conflict.onDecision}
                />
            ) : null}
            <ModalShell
                dismiss="backdrop"
                initialFocus={recoveryCancel}
                onRequestClose={() => prompts.recovery?.onCancel()}
                open={ready && prompts.recovery !== null}
                title={t('recovery.quit.title')}
            >
                <p>{t('recovery.quit.message')}</p>
                {recovery?.message !== undefined ? <p>{recovery.message}</p> : null}
                {prompts.recovery !== null && prompts.recovery.names.length > 0 ? (
                    <ul aria-label={t('recovery.quit.documents')}>
                        {prompts.recovery.names.map((name) => (
                            <li key={name}>{name}</li>
                        ))}
                    </ul>
                ) : (
                    <p>{t('recovery.quit.documents.none')}</p>
                )}
                <div>
                    <Button ref={recoveryCancel} variant="secondary" onClick={prompts.recovery?.onCancel}>
                        {t('recovery.quit.cancel')}
                    </Button>
                    <Button variant="primary" onClick={prompts.recovery?.onConfirm}>
                        {t('recovery.quit.confirm')}
                    </Button>
                </div>
            </ModalShell>
            <LiveRegion message={announcement} />
        </>
    );
}
