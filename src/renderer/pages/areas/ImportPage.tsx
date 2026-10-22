import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatYearMonth } from '@shared/dates';
import { toDigitStyle, type DigitStyle } from '@shared/digits';
import { formatPlain } from '@shared/formatNumber';
import type { ImportChoice, ImportPreview, RowProblem } from '@shared/import';
import { flash } from '../../app/flash';
import { callIpc } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { LinkButton } from '../../components/LinkButton';
import { MoneyText } from '../../components/MoneyText';
import { Notice, type NoticeMessage } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { PhoneText } from '../../components/PhoneText';
import styles from './ImportPage.module.css';

/** Rows shown in the preview table; the count of the rest is given below it. */
const PREVIEW_ROWS = 100;

/**
 * Marks a name as one piece (Unicode isolate marks), so a Latin file name in
 * RTL text, or a list of Sorani names in English, keeps its order.
 */
const isolate = (text: string) => `\u2068${text}\u2069`;

type Translate = ReturnType<typeof useTranslation>['t'];

/** One problem of a row in plain words, for example "currency must be IQD or USD". */
function problemText(problem: RowProblem, t: Translate, digits: DigitStyle): string {
  const number = (value: number) => formatPlain(value, digits);
  switch (problem.kind) {
    case 'missing':
      return t('import.problem.missing', { column: t(`import.columns.${problem.column}`) });
    case 'too_long':
      return t('import.problem.too_long', {
        column: t(`import.columns.${problem.column}`),
        max: number(problem.max),
      });
    case 'bad_price':
      return t(
        problem.currency
          ? `import.problem.bad_price_${problem.currency}`
          : 'import.problem.bad_price',
      );
    case 'bad_year':
      return t('import.problem.bad_year', {
        min: toDigitStyle(String(problem.min), digits),
        max: toDigitStyle(String(problem.max), digits),
      });
    case 'same_as_row':
      return t('import.problem.same_as_row', { row: number(problem.otherRow) });
    default:
      return t(`import.problem.${problem.kind}`);
  }
}

/** Why a whole file was refused, in plain words. */
function fileProblemText(
  choice: Extract<ImportChoice, { ok: false }>,
  t: Translate,
  digits: DigitStyle,
) {
  switch (choice.reason) {
    case 'too_many_rows':
      return t('import.file.too_many_rows', { max: formatPlain(choice.max, digits) });
    case 'missing_columns':
      return t('import.file.missing_columns', {
        columns: choice.columns
          .map((column) => t(`import.columns.${column}`))
          .join(t('import.listSeparator')),
      });
    default:
      return t(`import.file.${choice.reason}`);
  }
}

/** What the checked file holds: the areas to import, the rows to skip and why. */
function PreviewDetails({ preview }: { preview: ImportPreview }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const digits = settings.digitStyle;
  const number = (value: number) => formatPlain(value, digits);
  const shown = preview.rows.slice(0, PREVIEW_ROWS);

  return (
    <>
      <ul className={styles.summary}>
        <li>{t('import.fileLabel', { name: isolate(preview.fileName) })}</li>
        <li className={styles.strong}>
          {t('import.readyCount', { number: number(preview.rows.length) })}
        </li>
        {preview.problems.length > 0 && (
          <li>{t('import.skippedCount', { number: number(preview.problems.length) })}</li>
        )}
        {preview.newCategories.length > 0 && (
          <li>
            {t('import.newCategories', {
              names: preview.newCategories.map(isolate).join(t('import.listSeparator')),
            })}
          </li>
        )}
      </ul>

      {preview.problems.length > 0 && (
        <section className={styles.section} aria-labelledby="import-problems">
          <h2 id="import-problems" className={styles.sectionTitle}>
            {t('import.problemsTitle')}
          </h2>
          <p className={styles.muted}>{t('import.problemsHint')}</p>
          <ul className={styles.problems}>
            {preview.problems.map((problem) => (
              <li key={problem.row}>
                {t('import.rowProblem', {
                  row: number(problem.row),
                  problems: problem.problems
                    .map((item) => problemText(item, t, digits))
                    .join(t('import.problem.separator')),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {shown.length > 0 && (
        <section className={styles.section} aria-labelledby="import-preview">
          <h2 id="import-preview" className={styles.sectionTitle}>
            {t('import.previewTitle')}
          </h2>
          <div className={styles.tableFrame}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('import.columns.name')}</th>
                  <th>{t('import.columns.category')}</th>
                  <th>{t('import.columns.monthlyPrice')}</th>
                  <th>{t('import.start')}</th>
                  <th>{t('import.columns.renterName')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.row}>
                    <td className={styles.strong}>{row.name}</td>
                    <td>{row.category}</td>
                    <td className={styles.nowrap}>
                      <MoneyText amount={row.monthlyPrice} currency={row.currency} />
                    </td>
                    <td className={styles.nowrap}>{formatYearMonth(row.rentStartsFrom, digits)}</td>
                    <td>
                      {row.renter && (
                        <span className={styles.renter}>
                          {row.renter.fullName}
                          {row.renter.phone && <PhoneText phone={row.renter.phone} />}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > shown.length && (
            <p className={styles.muted}>
              {t('import.moreRows', { number: number(preview.rows.length - shown.length) })}
            </p>
          )}
        </section>
      )}
    </>
  );
}

/** Areas → Import from Excel: the template, choosing a filled file, its preview, and Import. */
export function ImportPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const mounted = useMountedRef();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<NoticeMessage | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  /** Runs one step with the buttons disabled; nothing happens after the page is left. */
  const step = async <T,>(run: () => Promise<T>, then: (result: T) => void) => {
    setBusy(true);
    setMessage(null);
    const result = await run();
    if (!mounted.current) return;
    setBusy(false);
    then(result);
  };

  const downloadTemplate = () =>
    step(
      () => callIpc('import:template'),
      (result) => {
        if (!result.ok || !result.data.ok) {
          setMessage({ tone: 'error', text: t('import.templateFailed') });
        } else if (result.data.done === 'saved') {
          setMessage({ tone: 'success', text: t('import.templateSaved') });
        }
      },
    );

  const chooseFile = () =>
    step(
      () => callIpc('import:choose'),
      (result) => {
        if (!result.ok) {
          setMessage({ tone: 'error', text: t('errors.unexpected') });
          return;
        }
        const choice = result.data;
        if (!choice.ok) {
          setPreview(null);
          setMessage({ tone: 'error', text: fileProblemText(choice, t, settings.digitStyle) });
        } else if (choice.done === 'checked') {
          setPreview(choice.preview);
          if (choice.preview.rows.length === 0) {
            setMessage({ tone: 'error', text: t('import.nothingToImport') });
          }
        }
      },
    );

  const importAreas = () =>
    step(
      () => callIpc('import:apply'),
      (result) => {
        const outcome = result.ok ? result.data : null;
        if (outcome?.ok) {
          const digits = settings.digitStyle;
          void navigate('/areas', {
            state: flash(
              t('import.done', {
                areas: formatPlain(outcome.areas, digits),
                categories: formatPlain(outcome.categories, digits),
              }),
            ),
          });
          return;
        }
        setPreview(null);
        setMessage({
          tone: 'error',
          text: outcome ? t('import.changed') : t('errors.unexpected'),
        });
      },
    );

  const canImport = preview !== null && preview.rows.length > 0;

  return (
    <>
      <PageHeader title={t('import.title')} />
      <div className={styles.stack}>
        <p className={styles.muted}>{t('import.intro')}</p>
        <div className={styles.steps}>
          <div className={styles.step}>
            <p>
              {formatPlain(1, settings.digitStyle)}. {t('import.step1')}
            </p>
            <BigButton icon="download" onClick={() => void downloadTemplate()} disabled={busy}>
              {t('import.downloadTemplate')}
            </BigButton>
          </div>
          <div className={styles.step}>
            <p>
              {formatPlain(2, settings.digitStyle)}. {t('import.step2')}
            </p>
            <BigButton
              variant={preview ? 'secondary' : 'primary'}
              onClick={() => void chooseFile()}
              disabled={busy}
            >
              {preview ? t('import.chooseAnother') : t('import.chooseFile')}
            </BigButton>
          </div>
        </div>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {preview && <PreviewDetails preview={preview} />}
        <div className={styles.buttonRow}>
          {canImport && (
            <BigButton variant="primary" onClick={() => void importAreas()} disabled={busy}>
              {t('import.importButton')}
            </BigButton>
          )}
          <LinkButton to="/areas" icon="back">
            {t('pages.areas.title')}
          </LinkButton>
        </div>
      </div>
    </>
  );
}
