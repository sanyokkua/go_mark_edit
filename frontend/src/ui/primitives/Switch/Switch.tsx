import { hasCommandModifier } from '../commandModifier';
import styles from './Switch.module.css';

/** The track and thumb look, for rows that report an on/off value without being the control (menu rows). */
export const switchTrackClassName = styles.toggle;

export interface SwitchProps {
    readonly checked: boolean;
    readonly describedBy?: string;
    readonly disabled?: boolean;
    /** Accessible name; the visible label lives beside the control. */
    readonly label: string;
    readonly onChange: (checked: boolean) => void;
}

/** An on/off setting that announces its state. */
const Switch: React.FC<SwitchProps> = ({
    checked,
    describedBy,
    disabled = false,
    label,
    onChange,
}: SwitchProps): React.JSX.Element => (
    <button
        aria-checked={checked}
        aria-describedby={describedBy}
        aria-label={label}
        className={styles.toggle}
        data-checked={checked}
        disabled={disabled}
        role="switch"
        type="button"
        onClick={(): void => onChange(!checked)}
        onKeyDown={(event): void => {
            if ((event.key !== 'Enter' && event.key !== ' ') || hasCommandModifier(event)) return;
            event.preventDefault();
            event.currentTarget.click();
        }}
    />
);

export default Switch;
