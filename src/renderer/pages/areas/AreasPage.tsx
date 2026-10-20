import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SEARCH_MAX, type AreaListItem } from '@shared/areas';
import { formatPlain } from '@shared/formatNumber';
import { useIpcQuery } from '../../app/ipc';
import { useFlashNotice } from '../../app/flash';
import { useSettings } from '../../app/SettingsContext';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { CategoryDot } from '../../components/CategoryDot';
import { EmptyState } from '../../components/EmptyState';
import { LinkButton } from '../../components/LinkButton';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { PhoneText } from '../../components/PhoneText';
import { SearchField } from '../../components/SearchField';
import styles from './AreasPage.module.css';
import { RentText } from './RentText';

const SEARCH_DELAY_MS = 150;

/** The list of all areas: filter by category, search, and open one. */
export function AreasPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const notice = useFlashNotice();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const query = useDebouncedValue(search, SEARCH_DELAY_MS);
  const categories = useIpcQuery('categories:list');
  const areas = useIpcQuery('areas:list', { search: query, categoryId });

  const collator = useMemo(() => new Intl.Collator(settings.language), [settings.language]);
  const sorted = useMemo<AreaListItem[]>(
    () =>
      areas.state.status === 'ready'
        ? [...areas.state.data].sort((a, b) => collator.compare(a.name, b.name))
        : [],
    [areas.state, collator],
  );

  const header = (
    <PageHeader
      title={t('pages.areas.title')}
      actions={
        <>
          <LinkButton to="/areas/categories">{t('areas.categories')}</LinkButton>
          <LinkButton to="/areas/new" variant="primary">
            {t('areas.add')}
          </LinkButton>
        </>
      }
    />
  );

  if (areas.state.status === 'error' || categories.state.status === 'error') {
    return (
      <>
        {header}
        <Notice tone="error">{t('errors.unexpected')}</Notice>
      </>
    );
  }
  if (areas.state.status === 'loading' || categories.state.status === 'loading') return header;

  const nothingYet = sorted.length === 0 && query === '' && categoryId === null;
  if (nothingYet) {
    return (
      <>
        {header}
        {notice && <Notice tone="success">{notice}</Notice>}
        <EmptyState
          title={t('areas.empty.title')}
          body={t('areas.empty.body')}
          action={
            <LinkButton to="/areas/new" variant="primary">
              {t('areas.empty.button')}
            </LinkButton>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className={styles.stack}>
        {notice && <Notice tone="success">{notice}</Notice>}
        <div className={styles.chips} role="group" aria-label={t('areas.categories')}>
          {[{ id: null, name: t('areas.all'), color: null }, ...categories.state.data].map(
            (category) => (
              <button
                key={category.id ?? 'all'}
                type="button"
                className={styles.chip}
                aria-pressed={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              >
                {category.id !== null && <CategoryDot color={category.color} />}
                {category.name}
              </button>
            ),
          )}
        </div>
        <SearchField
          label={t('areas.search')}
          value={search}
          onChange={setSearch}
          maxLength={SEARCH_MAX}
        />
        <p className={styles.count} aria-live="polite">
          {t('areas.count', { number: formatPlain(sorted.length, settings.digitStyle) })}
        </p>
        {sorted.length === 0 ? (
          <EmptyState title={t('areas.noMatch')} />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('areas.columns.name')}</th>
                <th>{t('areas.columns.category')}</th>
                <th>{t('areas.columns.renter')}</th>
                <th>{t('areas.columns.phone')}</th>
                <th>{t('areas.columns.rent')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((area) => (
                <tr key={area.id} onClick={() => void navigate(`/areas/${area.id}`)}>
                  <td>
                    <Link
                      to={`/areas/${area.id}`}
                      className={styles.name}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {area.name}
                    </Link>
                  </td>
                  <td>
                    <span className={styles.category}>
                      <CategoryDot color={area.categoryColor} />
                      {area.categoryName}
                    </span>
                  </td>
                  <td>
                    {area.renterName ?? <span className={styles.muted}>{t('areas.noRenter')}</span>}
                  </td>
                  <td className={styles.number}>
                    {area.renterPhone && <PhoneText phone={area.renterPhone} />}
                  </td>
                  <td className={styles.number}>
                    <RentText price={area.currentPrice} currency={area.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
