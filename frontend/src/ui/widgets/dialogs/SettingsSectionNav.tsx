import { useRef } from 'react';

import styles from './SettingsDialog.module.css';

export interface SettingsNavSection {
    readonly id: string;
    readonly label: string;
}

export interface SettingsSectionNavProps {
    readonly ariaLabel: string;
    /** Receives the selected tab so the dialog can focus it on open. */
    readonly selectedTabRef?: React.RefObject<HTMLButtonElement | null>;
    readonly onSelect: (id: string) => void;
    readonly sections: readonly SettingsNavSection[];
    readonly selectedId: string;
}

export const tabId = (id: string): string => `settings-tab-${id}`;
export const panelId = (id: string): string => `settings-panel-${id}`;

function destinationIndex(key: string, current: number, length: number): number | undefined {
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + length) % length;
    if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % length;
    return undefined;
}

/** The section list: one tab stop, arrow/Home/End keys move and show a section at once. */
const SettingsSectionNav: React.FC<SettingsSectionNavProps> = ({
    ariaLabel,
    onSelect,
    sections,
    selectedId,
    selectedTabRef,
}: SettingsSectionNavProps): React.JSX.Element => {
    const tabs = useRef<Array<HTMLButtonElement | null>>([]);
    return (
        <div aria-label={ariaLabel} aria-orientation="vertical" className={styles.nav} role="tablist">
            {sections.map((section, index): React.JSX.Element => {
                const selected = section.id === selectedId;
                return (
                    <button
                        key={section.id}
                        ref={(element): void => {
                            tabs.current[index] = element;
                            if (selected && selectedTabRef !== undefined) selectedTabRef.current = element;
                        }}
                        aria-controls={panelId(section.id)}
                        aria-selected={selected}
                        className={selected ? styles.tabSelected : styles.tab}
                        id={tabId(section.id)}
                        role="tab"
                        tabIndex={selected ? 0 : -1}
                        type="button"
                        onClick={(): void => onSelect(section.id)}
                        onKeyDown={(event): void => {
                            const next = destinationIndex(event.key, index, sections.length);
                            const target = next === undefined ? undefined : sections[next];
                            if (target === undefined || next === undefined) return;
                            event.preventDefault();
                            onSelect(target.id);
                            tabs.current[next]?.focus();
                        }}
                    >
                        {section.label}
                    </button>
                );
            })}
        </div>
    );
};

export default SettingsSectionNav;
