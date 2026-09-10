import { t } from '../../i18n';
import ModalShell from '../components/ModalShell';
import Button from '../primitives/Button';
import styles from './AppearanceDialog.module.css';

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
}

const AboutDialog: React.FC<AboutDialogProps> = ({
  open,
  onOpenChange,
  version,
}: AboutDialogProps): React.JSX.Element | null => {
  if (!open) return null;
  return (
    <ModalShell
      dismiss="backdrop"
      onRequestClose={(): void => onOpenChange(false)}
      open
      title={t('about.title')}
      width="32rem"
    >
      <p>{t('about.version', { version })}</p>
      <Button
        className={styles.close}
        variant="primary"
        onClick={(): void => onOpenChange(false)}
      >
        {t('appearance.close')}
      </Button>
    </ModalShell>
  );
};

export default AboutDialog;
