import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import type { ClassifiedError } from '../../../logic/store/appModelTypes';
import ModalShell from '../../components/ModalShell';
import Button from '../../primitives/Button';
import styles from '../../components/ModalShell/ModalShell.module.css';

export interface CreateEntryPromptProps {
    open: boolean;
    parentPath: string;
    kind: 'file' | 'folder';
    supportedSuffixes: readonly string[];
    onCreate: (name: string) => Promise<{ status?: string; error?: ClassifiedError } | undefined>;
    onCancel: () => void;
}

export default function CreateEntryPrompt({
    open,
    kind,
    supportedSuffixes,
    onCreate,
    onCancel,
}: CreateEntryPromptProps): React.JSX.Element | null {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    if (!open) return null;

    const invalid = name.length === 0 || /[/\\]/.test(name);
    const create = async (): Promise<void> => {
        if (busy || invalid) return;
        if (name.startsWith('.')) {
            setError(t('workspace.create.hiddenName'));
            return;
        }
        const finalName =
            kind === 'file' && !supportedSuffixes.some((suffix) => name.toLowerCase().endsWith(suffix.toLowerCase()))
                ? `${name}.md`
                : name;
        setBusy(true);
        try {
            const result = await onCreate(finalName);
            if (result?.error !== undefined) {
                setError(result.error.message || t('workspace.create.failed'));
            }
        } catch {
            setError(t('workspace.create.failed'));
        } finally {
            setBusy(false);
        }
    };
    return (
        <ModalShell
            dismiss="escape"
            initialFocus={inputRef}
            onRequestClose={(): void => {
                if (!busy) onCancel();
            }}
            open
            title={t(kind === 'file' ? 'workspace.create.fileTitle' : 'workspace.create.folderTitle')}
        >
            <div className={styles.promptBody} data-create-entry-prompt>
                <label htmlFor="workspace-entry-name">{t('workspace.create.name')}</label>
                <input
                    ref={inputRef}
                    id="workspace-entry-name"
                    value={name}
                    onChange={(event): void => {
                        setName(event.target.value);
                        setError(null);
                    }}
                    onKeyDown={(event): void => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void create();
                        }
                    }}
                />
                {error !== null ? <p role="alert">{error}</p> : null}
                <div className={styles.actions}>
                    <Button variant="secondary" disabled={busy} onClick={onCancel}>
                        {t('workspace.create.cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        disabled={busy || invalid}
                        onClick={(): void => {
                            void create();
                        }}
                    >
                        {t('workspace.create.create')}
                    </Button>
                </div>
            </div>
        </ModalShell>
    );
}
