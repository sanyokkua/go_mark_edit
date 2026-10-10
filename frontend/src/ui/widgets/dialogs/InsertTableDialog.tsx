import { useEffect, useRef, useState } from 'react';

import { t } from '../../../i18n';
import { capturedSelectionCommands, type EditorActionSnapshot } from '../../../logic/actions/editorActionExecutor';
import { runFormatAction } from '../../../logic/format/formatting';
import ModalShell from '../../components/ModalShell';
import styles from '../../components/ModalShell/ModalShell.module.css';
import Button from '../../primitives/Button';

const maxColumns = 20;
const maxRows = 100;

export interface InsertTableDialogProps {
    open: boolean;
    snapshot: EditorActionSnapshot | null;
    onClose: () => void;
}

function inRange(value: string, max: number): boolean {
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max;
}

function InsertTableForm({
    snapshot,
    columnsRef,
    onClose,
}: {
    snapshot: EditorActionSnapshot;
    columnsRef: React.RefObject<HTMLInputElement | null>;
    onClose: () => void;
}): React.JSX.Element {
    const [columns, setColumns] = useState('3');
    const [rows, setRows] = useState('3');
    const columnsValid = inRange(columns, maxColumns);
    const rowsValid = inRange(rows, maxRows);
    const valid = columnsValid && rowsValid;

    const insert = (): void => {
        if (!valid) return;
        runFormatAction({
            actionId: 'table',
            commands: capturedSelectionCommands(snapshot.commands, snapshot.selection),
            selection: snapshot.selection,
            table: { columns: Number(columns), rows: Number(rows) },
        });
        onClose();
    };
    const submitOnEnter = (event: React.KeyboardEvent): void => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        insert();
    };

    return (
        <div className={styles.promptBody} data-insert-table-dialog>
            <label htmlFor="insert-table-columns">{t('table.dialog.columns')}</label>
            <input
                ref={columnsRef}
                aria-invalid={!columnsValid}
                id="insert-table-columns"
                max={maxColumns}
                min={1}
                type="number"
                value={columns}
                onChange={(event): void => setColumns(event.target.value)}
                onKeyDown={submitOnEnter}
            />
            {columnsValid ? null : (
                <p className={styles.warning} role="alert">
                    {t('table.dialog.columns.invalid')}
                </p>
            )}
            <label htmlFor="insert-table-rows">{t('table.dialog.rows')}</label>
            <input
                aria-invalid={!rowsValid}
                id="insert-table-rows"
                max={maxRows}
                min={1}
                type="number"
                value={rows}
                onChange={(event): void => setRows(event.target.value)}
                onKeyDown={submitOnEnter}
            />
            {rowsValid ? null : (
                <p className={styles.warning} role="alert">
                    {t('table.dialog.rows.invalid')}
                </p>
            )}
            <div className={styles.actions}>
                <Button variant="secondary" onClick={onClose}>
                    {t('table.dialog.cancel')}
                </Button>
                <Button variant="primary" disabled={!valid} onClick={insert}>
                    {t('table.dialog.insert')}
                </Button>
            </div>
        </div>
    );
}

/** Asks for a table size, then inserts it through the shared format runner as one edit. */
export default function InsertTableDialog({ open, snapshot, onClose }: InsertTableDialogProps): React.JSX.Element {
    const columnsRef = useRef<HTMLInputElement | null>(null);
    const shown = open && snapshot !== null;
    const returnTo = useRef<EditorActionSnapshot | null>(null);

    // The dialog restores focus to its opener on close; the editor must win afterwards.
    useEffect((): void => {
        if (shown) {
            returnTo.current = snapshot;
            return;
        }
        returnTo.current?.commands?.focus();
        returnTo.current = null;
    }, [shown, snapshot]);

    return (
        <ModalShell
            dismiss="escape"
            initialFocus={columnsRef}
            onRequestClose={onClose}
            open={shown}
            title={t('table.dialog.title')}
        >
            {snapshot === null ? null : (
                <InsertTableForm snapshot={snapshot} columnsRef={columnsRef} onClose={onClose} />
            )}
        </ModalShell>
    );
}
