import { Children, type ReactNode } from 'react';

import { t } from '../../i18n';
import type { AlertKind } from '../../logic/markdown/syntax/alerts';
import Icon, { type IconName } from '../primitives/Icon';
import styles from './AlertBox.module.css';

const icons: Record<AlertKind, IconName> = {
    note: 'note',
    tip: 'tip',
    important: 'important',
    warning: 'warning',
    caution: 'caution',
};

interface AlertBoxProps {
    kind: AlertKind;
    children: ReactNode;
    sourceLine?: number | string;
}

export default function AlertBox({ kind, children, sourceLine }: AlertBoxProps): React.JSX.Element {
    return (
        <div className={`${styles.alert} ${styles[kind]}`} data-source-line={sourceLine} role="note">
            <p className={styles.title}>
                <Icon name={icons[kind]} />
                {t(`preview.alert.${kind}`)}
            </p>
            {Children.toArray(children).slice(1)}
        </div>
    );
}
