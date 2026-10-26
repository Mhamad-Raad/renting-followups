import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { areaLabel, areaSubline, SEARCH_MAX, type AreaNaming } from '@shared/areas';
import { formatPlain } from '@shared/formatNumber';
import { normalizeText } from '@shared/normalizeText';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { Icon } from '../../components/Icon';
import { SearchField } from '../../components/SearchField';
import styles from './ReportsPage.module.css';

interface AreaPickerProps {
  candidates: readonly ({ id: number } & AreaNaming)[];
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

  // With many areas a search narrows the tiles; the buttons then act on the ones shown only.
  const [search, setSearch] = useState('');
  const query = normalizeText(search);
  const shown = useMemo(
    () =>
      query === ''
        ? candidates
        : candidates.filter((area) =>
            normalizeText(`${area.name} ${area.categoryName} ${area.renterName ?? ''}`).includes(
              query,
            ),
          ),
    [candidates, query],
  );
  const shownIds = new Set(shown.map((area) => area.id));
  const includeShown = () => onChange(excludedIds.filter((id) => !shownIds.has(id)));
  const leaveOutShown = () =>
    onChange([...excludedIds.filter((id) => !shownIds.has(id)), ...shownIds]);

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
          <SearchField
            label={t('reports.picker.search')}
            value={search}
            onChange={setSearch}
            maxLength={SEARCH_MAX}
          />
          <BigButton onClick={includeShown} disabled={shown.length === 0}>
            {t(query === '' ? 'reports.picker.all' : 'reports.picker.allShown')}
          </BigButton>
          <BigButton onClick={leaveOutShown} disabled={shown.length === 0}>
            {t(query === '' ? 'reports.picker.none' : 'reports.picker.noneShown')}
          </BigButton>
        </div>
        {shown.length === 0 && <p className={styles.pickerEmpty}>{t('reports.picker.noMatch')}</p>}
        <ul className={styles.pickerList}>
          {shown.map((area) => {
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
                    <span className={styles.pickerName}>{areaLabel(area)}</span>
                    <span className={styles.pickerCategory}>{areaSubline(area)}</span>
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
