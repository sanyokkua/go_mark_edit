import type { StartupFailure as StartupFailureDetails } from '../../../app/useBootstrap';
import { nativeLifecycleAdapter } from '../../../logic/adapter';
import { t } from '../../../i18n';

import Button from '../../primitives/Button';
import styles from './StartupFailure.module.css';

interface StartupFailureProps {
  failure?: StartupFailureDetails | null;
  isRetrying: boolean;
  onQuit?: () => void;
  onRetry: () => void;
}

const stepLabels: Record<StartupFailureDetails['step'], string> = {
  bridge: 'startup.failure.step.bridge',
  model: 'startup.failure.step.model',
  settings: 'startup.failure.step.settings',
  'window-ready': 'startup.failure.step.windowReady',
};

function safeCategory(category: string): string {
  const normalized = category.trim();
  return /^[a-z][a-z0-9 _-]{0,63}$/u.test(normalized) ? normalized : 'internal';
}

function messageFor(failure: StartupFailureDetails): string {
  const step = t(stepLabels[failure.step]);
  if (failure.timedOut) {
    return t('startup.failure.timeout', { step });
  }
  return t('startup.failure.category', {
    category: safeCategory(failure.category),
    step,
  });
}

const StartupFailure: React.FC<StartupFailureProps> = ({
  failure = null,
  isRetrying,
  onQuit = nativeLifecycleAdapter.requestQuit,
  onRetry,
}: StartupFailureProps): React.JSX.Element => (
  <section className={styles.failure}>
    <div
      aria-busy={isRetrying}
      aria-label={t('startup.failure.message')}
      className={styles.panel}
      role="status"
    >
      <h1>{t('startup.failure.title')}</h1>
      <p className={styles.message}>
        {failure === null ? t('startup.failure.message') : messageFor(failure)}
      </p>
      <div className={styles.actions}>
        {failure?.step !== 'bridge' ? (
          <Button
            className={styles.retry}
            disabled={isRetrying}
            variant="primary"
            onClick={onRetry}
          >
            {t('startup.retry')}
          </Button>
        ) : failure === null ? (
          <Button
            className={styles.retry}
            disabled={isRetrying}
            variant="primary"
            onClick={onRetry}
          >
            {t('startup.retry')}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onQuit}>
          {t('startup.quit')}
        </Button>
      </div>
    </div>
  </section>
);

export default StartupFailure;
