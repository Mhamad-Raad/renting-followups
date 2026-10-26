import { useTranslation } from 'react-i18next';
import type { AreaNaming } from '@shared/areas';
import { formatPlain } from '@shared/formatNumber';
import { useSettings } from '../../app/SettingsContext';
import { useAreaLabel } from '../../app/useAreaLabel';
import { BigButton } from '../../components/BigButton';
import { Icon } from '../../components/Icon';
import styles from './ReportsPage.module.css';

interface AreaPickerProps {
  candidates: readonly ({ id: number; categoryName: string } & AreaNaming)[];
  excludedIds: readonly number[];
  onChange: (excludedIds: readonly number[]) => void;
}

/** Ticks which areas go into the report. Folded away by default: usually all of them do. */
export function AreaPicker({ candidates, excludedIds, onChange }: AreaPickerProps) {
  const { t } = useTranslation();
  const label = useAreaLabel();
  const { settings } = useSettings();
  const excluded = new Set(excludedIds);
  const chosen = candidates.filter((area) => !excluded.has(area.id)).length;
  const toggle = (id: number, include: boolean) =>
    onChange(include ? excludedIds.filter((other) => other !== id) : [...excludedIds, id]);

  return (
    <details className={styles.picker}>
      <summary className={styles.pickerTitle}>
        <span>
          {t('reports.picker.title', {
            chosen: formatPlain(chosen, settings.digitStyle),
            total: formatPlain(candidates.length, settings.digitStyle),
          })}
        </span>
        <Icon name="chevronDown" className={styles.pickerChevron} />
      </summary>
      <div className={styles.pickerBody}>
        <div className={styles.pickerActions}>
          <BigButton onClick={() => onChange([])}>{t('reports.picker.all')}</BigButton>
          <BigButton onClick={() => onChange(candidates.map((area) => area.id))}>
            {t('reports.picker.none')}
          </BigButton>
        </div>
        <ul className={styles.pickerList}>
          {candidates.map((area) => {
            const included = !excluded.has(area.id);
            return (
              <li key={area.id}>
                <label className={styles.pickerItem} data-checked={included}>
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(event) => toggle(area.id, event.target.checked)}
                  />
                  {/* The category tells apart areas shown by the same renter, or with no name. */}
                  <span className={styles.pickerText}>
                    <span className={styles.pickerName}>{label(area)}</span>
                    <span className={styles.pickerCategory}>{area.categoryName}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
