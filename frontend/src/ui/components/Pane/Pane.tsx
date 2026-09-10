import type { ReactNode } from 'react';

import styles from './Pane.module.css';

export interface PaneHeaderSlots {
  leading: ReactNode;
  trailing?: ReactNode;
}

export interface PaneProps {
  accessory?: ReactNode;
  ariaLabel?: string;
  body: ReactNode;
  header?: PaneHeaderSlots;
  hidden?: boolean;
  identity: string;
}

const Pane: React.FC<PaneProps> = ({
  accessory,
  ariaLabel,
  body,
  header,
  hidden = false,
  identity,
}: PaneProps): React.JSX.Element => (
  <section
    aria-hidden={hidden}
    aria-label={ariaLabel ?? identity}
    className={`${styles.pane} ${hidden ? styles.paneHidden : ''}`}
    data-pane-identity={identity}
  >
    {header === undefined ? null : (
      <header className={styles.paneHeader}>
        <div className={styles.headerLeading}>{header.leading}</div>
        {header.trailing === undefined ? null : (
          <div className={styles.headerTrailing}>{header.trailing}</div>
        )}
      </header>
    )}
    {accessory === undefined ? null : (
      <div className={styles.accessory} data-pane-accessory="true">
        {accessory}
      </div>
    )}
    {body}
  </section>
);

export default Pane;
