import type { HTMLAttributes } from 'react';

import styles from './Island.module.css';

export interface IslandProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'aria-label'
> {
  readonly children: React.ReactNode;
  readonly label: string;
}

const Island: React.FC<IslandProps> = ({
  children,
  className,
  label,
  ...rest
}: IslandProps): React.JSX.Element => (
  <div
    {...rest}
    aria-label={label}
    className={`${styles.island} ${className ?? ''}`.trim()}
    data-island-label={label}
    role="group"
  >
    {children}
  </div>
);

export default Island;
