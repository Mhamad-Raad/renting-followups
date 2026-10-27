import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  areaLabel,
  areaSubline,
  compareAreaLabels,
  hasOwnName,
  nameCollator,
  SEARCH_MAX,
  type AreaDetails,
  type AreaListItem,
} from '@shared/areas';
import { formatPlain } from '@shared/formatNumber';
import type { TFunction } from 'i18next';
import type { MonthBox } from '@shared/months';
import { PART_SEPARATOR } from '@shared/reportText';
import { callIpc, useIpcQuery, type QueryState } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useFlashNotice } from '../../app/flash';
import { useSettings } from '../../app/SettingsContext';
import { useDebouncedValue } from '../../app/useDebouncedValue';
import { ActionMenu, type ActionMenuItem } from '../../components/ActionMenu';
import { CategoryDot } from '../../components/CategoryDot';
import { CurrencyTag } from '../../components/CurrencyTag';
import { Checkbox } from '../../components/Checkbox';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { LinkButton } from '../../components/LinkButton';
import { MoneyText } from '../../components/MoneyText';
import { MonthBoxes, YearSummaryText } from '../../components/MonthBoxes';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { PhoneText } from '../../components/PhoneText';
import { SearchField } from '../../components/SearchField';
import styles from './AreasPage.module.css';
import { ReportOutputButtons } from '../../print/ReportOutputButtons';
import { editAreaLink, type AreaAction } from './links';
import { NoAreasYet } from './NoAreasYet';
import { RentText } from './RentText';
import { ACTION_DIALOGS, useAreaActions } from './useAreaActions';
import { useMonthPick, type MonthPickOutcome } from './useMonthPick';

const SEARCH_DELAY_MS = 150;

/** The ids of the areas on screen right now. */
function sortedIds(state: QueryState<AreaListItem[]>): number[] {
  return state.status === 'ready' ? state.data.map((area) => area.id) : [];
}

interface AreaStripProps {
  area: AreaListItem;
  year: number;
  onPick: (area: AreaListItem, box: MonthBox) => void;
}

/** One row's month strip, drawn again only when that area's months change (not on every key press). */
const AreaStrip = memo(function AreaStrip({ area, year, onPick }: AreaStripProps) {
  const pick = useCallback((box: MonthBox) => onPick(area, box), [area, onPick]);
  return (
    <MonthBoxes boxes={area.months} year={year} currency={area.currency} compact onPick={pick} />
  );
});

/** The ⋯ menu of one row: the area page's actions, opened here on the list. Edit is its own page. */
function rowActions(
  area: AreaListItem,
  t: TFunction,
  choose: (areaId: number, action: AreaAction) => void,
  edit: (areaId: number) => void,
): ActionMenuItem[] {
  const action = (key: AreaAction, label: string): ActionMenuItem => ({
    label,
    onSelect: () => choose(area.id, key),
  });
  return [
    action('payment', t('area.recordPayment')),
    action('pastPayment', t('area.recordPastPayment')),
    { label: t('common.edit'), onSelect: () => edit(area.id) },
    action('changePrice', t('area.changePrice')),
    area.currentPrice === 0
      ? action('setRentAgain', t('area.setRentAgain'))
      : action('markVacant', t('area.markVacant')),
    action('changeRenter', t('area.changeRenter')),
    { ...action('delete', t('common.delete')), tone: 'danger' },
  ];
}

/** The list of all areas: filter by category, search, and open one. */
export function AreasPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const flashed = useFlashNotice();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  // Ticked areas, for Print selected and Export selected.
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const query = useDebouncedValue(search, SEARCH_DELAY_MS);
  const categories = useIpcQuery('categories:list');
  const areas = useIpcQuery('areas:list', { search: query, categoryId });
  // The list shows the current year; the main process decides each month's status.
  const year = new Date().getFullYear();
  const [pickOutcome, setPickOutcome] = useState<MonthPickOutcome | null>(null);
  const { refresh: refreshAreas } = areas;
  const monthPick = useMonthPick((outcome) => {
    setPickOutcome(outcome);
    refreshAreas();
  });
  const { pick } = monthPick;

  // The area a ⋯ menu action is for; its details are loaded when the action is chosen.
  const [target, setTarget] = useState<AreaDetails | null>(null);
  const actions = useAreaActions(target, { onChanged: refreshAreas, initialNotice: flashed });
  const { open: openDialog, fail } = actions;
  const mounted = useMountedRef();
  const chooseAction = async (areaId: number, action: AreaAction) => {
    const result = await callIpc('areas:get', { id: areaId });
    if (!mounted.current) return;
    if (!result.ok || result.data === null) {
      fail(t('errors.unexpected'));
      return;
    }
    setTarget(result.data);
    openDialog(ACTION_DIALOGS[action]);
  };
  // After saving, Edit comes back here rather than to the area page.
  const editArea = (areaId: number) =>
    void navigate(editAreaLink(areaId), { state: { returnTo: '/areas' } });
  const pickMonth = useCallback(
    (area: AreaListItem, box: MonthBox) =>
      void pick({ areaId: area.id, currency: area.currency, year, box }),
    [pick, year],
  );

  // Only ticked areas that are still shown count, so a search never prints hidden areas.
  const chosen = useMemo(
    () => sortedIds(areas.state).filter((id) => selected.has(id)),
    [areas.state, selected],
  );
  const byLabel = useMemo(
    () => compareAreaLabels(nameCollator(settings.language)),
    [settings.language],
  );
  const sorted = useMemo<AreaListItem[]>(
    () => (areas.state.status === 'ready' ? [...areas.state.data].sort(byLabel) : []),
    [areas.state, byLabel],
  );

  const header = (
    <PageHeader
      title={t('pages.areas.title')}
      actions={
        <>
          <LinkButton to="/areas/categories">{t('areas.categories')}</LinkButton>
          <LinkButton to="/areas/import" icon="download">
            {t('areas.import')}
          </LinkButton>
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
        <LoadError
          onRetry={() => {
            areas.reload();
            categories.reload();
          }}
        />
      </>
    );
  }
  if (areas.state.status === 'loading' || categories.state.status === 'loading') return header;

  const nothingYet = sorted.length === 0 && query === '' && categoryId === null;
  if (nothingYet) {
    return (
      <>
        {header}
        {actions.feedback}
        <NoAreasYet />
      </>
    );
  }

  return (
    <>
      {header}
      <div className={styles.stack}>
        {actions.feedback}
        {pickOutcome && <Notice tone={pickOutcome.tone}>{pickOutcome.text}</Notice>}
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
          {chosen.length > 0 &&
            `${PART_SEPARATOR}${t('print.selectedCount', { number: formatPlain(chosen.length, settings.digitStyle) })}`}
        </p>
        {chosen.length > 0 && (
          <ReportOutputButtons
            printLabel={t('print.actions.printSelected')}
            query={{
              year: new Date().getFullYear(),
              month: null,
              categoryId: null,
              currency: null,
              status: 'all',
              excludedIds: [],
              onlyIds: chosen,
            }}
          />
        )}
        {sorted.length === 0 ? (
          <EmptyState title={t('areas.noMatch')} />
        ) : (
          <div className={styles.tableFrame}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.tick}>
                    <Checkbox
                      hideLabel
                      label={t('print.actions.selectAll')}
                      checked={sorted.length > 0 && sorted.every((area) => selected.has(area.id))}
                      onChange={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const area of sorted) {
                            if (checked) next.add(area.id);
                            else next.delete(area.id);
                          }
                          return next;
                        })
                      }
                    />
                  </th>
                  <th>{t('areas.columns.name')}</th>
                  <th>{t('areas.columns.renter')}</th>
                  <th>{t('areaForm.currency')}</th>
                  <th className={styles.money}>{t('areas.columns.rent')}</th>
                  <th className={styles.money}>{t('area.figures.expected')}</th>
                  <th className={styles.money}>{t('area.figures.received')}</th>
                  <th className={styles.money}>{t('area.figures.remaining')}</th>
                  <th>{t('areas.columns.thisYear')}</th>
                  <th>{t('area.notes')}</th>
                  <th className={styles.menuCell}>
                    <span className={styles.hidden}>{t('areas.columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((area) => (
                  <tr key={area.id} onClick={() => void navigate(`/areas/${area.id}`)}>
                    <td className={styles.tick} onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        hideLabel
                        label={t('print.actions.select', {
                          name: [areaLabel(area), areaSubline(area)]
                            .filter(Boolean)
                            .join(PART_SEPARATOR),
                        })}
                        checked={selected.has(area.id)}
                        onChange={(checked) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked) next.add(area.id);
                            else next.delete(area.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    {/* The same under every category: a place without a name goes by its category. */}
                    <td>
                      <Link
                        to={`/areas/${area.id}`}
                        className={styles.name}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {!hasOwnName(area) && <CategoryDot color={area.categoryColor} />}
                        {areaLabel(area)}
                      </Link>
                      {hasOwnName(area) && (
                        <span className={`${styles.second} ${styles.category}`}>
                          <CategoryDot color={area.categoryColor} />
                          {area.categoryName}
                        </span>
                      )}
                    </td>
                    <td>
                      {area.renterName ?? (
                        <span className={styles.muted}>{t('areas.noRenter')}</span>
                      )}
                      {area.renterPhone && (
                        <span className={`${styles.second} ${styles.number}`}>
                          <PhoneText phone={area.renterPhone} />
                        </span>
                      )}
                    </td>
                    <td>
                      <CurrencyTag currency={area.currency} />
                    </td>
                    <td className={styles.money}>
                      <RentText
                        price={area.currentPrice}
                        currency={area.currency}
                        withCurrency={false}
                      />
                    </td>
                    <td className={styles.money}>
                      <MoneyText
                        amount={area.figures.expected}
                        currency={area.currency}
                        withCurrency={false}
                      />
                    </td>
                    <td className={styles.money}>
                      <MoneyText
                        amount={area.figures.received}
                        currency={area.currency}
                        withCurrency={false}
                      />
                    </td>
                    <td
                      className={
                        area.figures.remaining > 0 ? `${styles.money} ${styles.owed}` : styles.money
                      }
                    >
                      <MoneyText
                        amount={area.figures.remaining}
                        currency={area.currency}
                        withCurrency={false}
                      />
                    </td>
                    <td>
                      <div className={styles.year}>
                        <AreaStrip area={area} year={year} onPick={pickMonth} />
                        <YearSummaryText summary={area.summary} />
                      </div>
                    </td>
                    <td>
                      {area.notes && (
                        <span className={styles.notes} title={area.notes} dir="auto">
                          {area.notes}
                        </span>
                      )}
                    </td>
                    <td className={styles.menuCell} onClick={(event) => event.stopPropagation()}>
                      <ActionMenu
                        label={t('areas.actionsFor', { name: areaLabel(area) })}
                        items={rowActions(
                          area,
                          t,
                          (areaId, action) => void chooseAction(areaId, action),
                          editArea,
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {monthPick.dialog}
      {actions.dialogs}
    </>
  );
}
