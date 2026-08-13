import type {
  DocumentMetadata,
  SaveStatus,
} from '../../logic/store/appModelTypes';
import { t } from '../../i18n';
import styles from './DocumentIdentity.module.css';

export interface DocumentIdentityProps {
  document?: DocumentMetadata;
  path?: string;
  parentName?: string;
  title?: string;
  status?: SaveStatus;
}

function safeSegment(value: string | undefined): string {
  const cleaned = (value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '');
  return cleaned.replace(/[\\/]/gu, '').trim();
}

function filenameFor(props: DocumentIdentityProps): string {
  const source =
    props.path ??
    props.document?.displayName ??
    props.title ??
    props.document?.path ??
    '';
  const normalized = source.replaceAll('\\', '/');
  return safeSegment(normalized.split('/').pop()) || t('editor.untitled');
}

function parentFor(props: DocumentIdentityProps): string | undefined {
  const direct = safeSegment(props.parentName ?? props.document?.parentName);
  if (direct.length > 0) return direct;
  const source = props.path ?? props.document?.path ?? '';
  const parts = source.replaceAll('\\', '/').split('/').filter(Boolean);
  return safeSegment(parts.at(-2)) || undefined;
}

export function statusLabel(status: SaveStatus | undefined): string {
  return t(`status.saveStatus.${status ?? 'not-saved'}`);
}

const DocumentIdentity: React.FC<DocumentIdentityProps> = (
  props: DocumentIdentityProps,
): React.JSX.Element => {
  const filename = filenameFor(props);
  const parent = parentFor(props);
  const status = statusLabel(props.status ?? props.document?.status);
  return (
    <header aria-label={t('identity.ariaLabel')} className={styles.identity}>
      <span aria-hidden="true" className={styles.saveDot} />
      <h1 className={styles.heading}>
        {parent === undefined ? filename : `${parent} / ${filename}`}
      </h1>
      <span className={styles.status}>{status}</span>
    </header>
  );
};

export default DocumentIdentity;
