import { useRef, useState } from 'react';

import { t } from '../../../i18n';
import ModalShell from '../../components/ModalShell';
import AppearanceSection from './AppearanceSection';
import EditorSection from './EditorSection';
import ExportSection from './ExportSection';
import MarkdownSection from './MarkdownSection';
import WorkspaceSection from './WorkspaceSection';
import SettingsSectionNav, { panelId, tabId } from './SettingsSectionNav';
import type { SettingsDialogProps } from './settingsDialogTypes';
import styles from './SettingsDialog.module.css';

export type { SettingsDialogProps } from './settingsDialogTypes';

interface SettingsSection {
    readonly Section: React.FC<SettingsDialogProps>;
    readonly id: string;
    readonly label: string;
}

/** The dialog's sections in display order; each owns its rows. */
const sections: readonly SettingsSection[] = [
    { Section: AppearanceSection, id: 'appearance', label: t('appearance.title') },
    { Section: EditorSection, id: 'editor', label: t('settings.menu.editor') },
    { Section: MarkdownSection, id: 'markdown', label: t('settings.markdown.title') },
    { Section: WorkspaceSection, id: 'workspace', label: t('settings.section.workspace') },
    { Section: ExportSection, id: 'export', label: t('settings.section.export') },
];

/** Mounted only while open, so every opening starts on the first section. */
const OpenSettingsDialog: React.FC<SettingsDialogProps> = (props: SettingsDialogProps): React.JSX.Element | null => {
    const { onOpenChange, returnFocusTo } = props;
    const [selectedId, setSelectedId] = useState(sections[0]?.id ?? '');
    const selectedTabRef = useRef<HTMLButtonElement | null>(null);
    const selected = sections.find((section) => section.id === selectedId) ?? sections[0];
    if (selected === undefined) return null;

    return (
        <ModalShell
            className={styles.dialog}
            closeLabel={t('appearance.close')}
            dismiss="backdrop"
            initialFocus={selectedTabRef}
            onRequestClose={(): void => onOpenChange(false)}
            open
            returnFocusTo={returnFocusTo}
            title={t('shell.settings')}
            width="min(760px, 94vw)"
        >
            <div className={styles.body}>
                <SettingsSectionNav
                    ariaLabel={t('settings.section.list')}
                    sections={sections}
                    selectedId={selected.id}
                    selectedTabRef={selectedTabRef}
                    onSelect={setSelectedId}
                />
                <div
                    aria-labelledby={tabId(selected.id)}
                    className={styles.pane}
                    id={panelId(selected.id)}
                    role="tabpanel"
                >
                    <h2 className={styles.heading}>{selected.label}</h2>
                    <selected.Section {...props} />
                </div>
            </div>
        </ModalShell>
    );
};

const SettingsDialog: React.FC<SettingsDialogProps> = (props: SettingsDialogProps): React.JSX.Element | null =>
    props.open ? <OpenSettingsDialog {...props} /> : null;

export default SettingsDialog;
