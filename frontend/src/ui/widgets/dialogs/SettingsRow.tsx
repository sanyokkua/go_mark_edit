import styles from './SettingsRow.module.css';

export interface SettingsRowProps {
    readonly children: React.ReactNode;
    readonly description?: string;
    /** Unique within the dialog; `${id}-description` is the id controls reference with `aria-describedby`. */
    readonly id: string;
    readonly label: string;
}

/** One setting: label and optional description on the left, the control on the right. */
const SettingsRow: React.FC<SettingsRowProps> = ({
    children,
    description,
    id,
    label,
}: SettingsRowProps): React.JSX.Element => (
    <div className={styles.row}>
        <div className={styles.text}>
            <span>{label}</span>
            {description === undefined ? null : (
                <small className={styles.description} id={`${id}-description`}>
                    {description}
                </small>
            )}
        </div>
        <div className={styles.control}>{children}</div>
    </div>
);

export const descriptionId = (id: string): string => `${id}-description`;

export default SettingsRow;
