import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Checkbox } from '../../components/Checkbox';
import styles from './ReportsPage.module.css';

interface AreaPickerProps {
  candidates: readonly { id: number; name: string }[];
  excludedIds: readonly number[];
  onChange: (excludedIds: readonly number[]) => void;
}

/** Ticks which areas go into the report. Folded away by default: usually all of them do. */
export function AreaPicker({ candidates, excludedIds, onChange }: AreaPickerProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const excluded = new Set(excludedIds);
  const chosen = candidates.filter((area) => !excluded.has(area.id)).length;
  const toggle = (id: number, include: boolean) =>
    onChange(include ? excludedIds.filter((other) => other !== id) : [...excludedIds, id]);

  return (
    <details className={styles.picker}>
      <summary className={styles.pickerTitle}>
        {t('reports.picker.title', {
          chosen: formatPlain(chosen, settings.digitStyle),
          total: formatPlain(candidates.length, settings.digitStyle),
        })}
      </summary>
      <div className={styles.pickerActions}>
        <BigButton onClick={() => onChange([])}>{t('reports.picker.all')}</BigButton>
        <BigButton onClick={() => onChange(candidates.map((area) => area.id))}>
          {t('reports.picker.none')}
        </BigButton>
      </div>
      <div className={styles.pickerList}>
        {candidates.map((area) => (
          <Checkbox
            key={area.id}
            label={area.name}
            checked={!excluded.has(area.id)}
            onChange={(checked) => toggle(area.id, checked)}
          />
        ))}
      </div>
    </details>
  );
}
