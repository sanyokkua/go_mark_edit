import { t } from '../../i18n';

import styles from './StartupFailure.module.css';

interface StartupFailureProps {
  isRetrying: boolean;
  onRetry: () => void;
}

const StartupFailure: React.FC<StartupFailureProps> = ({
  isRetrying,
  onRetry,
}: StartupFailureProps): React.JSX.Element => (
  <section className={styles.failure}>
    <div
      aria-busy={isRetrying}
      aria-label={t('startup.failure.message')}
      className={styles.panel}
      role="status"
    >
      <p className={styles.message}>{t('startup.failure.message')}</p>
      <div className={styles.actions}>
        <button
          className={styles.retry}
          disabled={isRetrying}
          type="button"
          onClick={onRetry}
        >
          {t('startup.retry')}
        </button>
      </div>
    </div>
  </section>
);

export default StartupFailure;
