import { t } from '../../i18n';
import styles from './AppBrand.module.css';

/**
 * The application mark and name, as the design's title bar draws them.
 *
 * The approved architecture keeps the operating system's own window frame, so
 * the design's traffic lights are not reproduced — that is the one
 * deliberate difference. Everything else in the leading run of the title bar is
 * this component's, and it occupies real layout, so the menu that follows it
 * lands at the design's coordinate by layout rather than by an offset.
 */
const AppBrand: React.FC = (): React.JSX.Element => (
    <div className={styles.brand} data-app-brand>
        <span aria-hidden="true" className={styles.logo}>
            {t('brand.mark')}
        </span>
        <span className={styles.name}>{t('brand.name')}</span>
    </div>
);

export default AppBrand;
