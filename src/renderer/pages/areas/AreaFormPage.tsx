import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  ADDRESS_MAX,
  AREA_NAME_MAX,
  NOTES_MAX,
  PHONE_PATTERN,
  type AreaDetails,
} from '@shared/areas';
import { CATEGORY_NAME_MAX } from '@shared/categories';
import { dateStringFromLocal, yearMonthOf, type DateString } from '@shared/dates';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { flash } from '../../app/flash';
import { BigButton } from '../../components/BigButton';
import { Checkbox } from '../../components/Checkbox';
import { DateField } from '../../components/DateField';
import { Form } from '../../components/Form';
import { LoadError } from '../../components/LoadError';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import styles from './AreaFormPage.module.css';
import { RenterFields, type RenterInput } from './RenterFields';
import { RentFields, type NewRent } from './RentFields';
import { parseRouteId } from '../../app/parseRouteId';

const NEW_CATEGORY = 'new';

type Problem =
  'duplicate_name' | 'category_not_found' | 'not_found' | 'duplicate_category' | 'unexpected';

/** Add area (`/areas/new`) or Edit area (`/areas/:id/edit`). */
export function AreaFormPage() {
  const { id } = useParams();
  const areaId = id === undefined ? null : parseRouteId(id);
  if (areaId === null) return <AreaForm area={null} />;
  return <EditAreaLoader areaId={areaId} />;
}

function EditAreaLoader({ areaId }: { areaId: number }) {
  const { t } = useTranslation();
  const area = useIpcQuery('areas:get', { id: areaId });
  if (area.state.status === 'loading') return null;
  if (area.state.status === 'error') return <LoadError onRetry={area.reload} />;
  if (area.state.data === null) {
    return <Notice tone="error">{t('areaForm.problems.not_found')}</Notice>;
  }
  return <AreaForm area={area.state.data} />;
}

function AreaForm({ area }: { area: AreaDetails | null }) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const navigate = useNavigate();
  const categories = useIpcQuery('categories:list');
  const today = new Date();
  const currentRenter = area?.renters.find((renter) => renter.endedOn === null) ?? null;

  const [name, setName] = useState(area?.name ?? '');
  const [categoryChoice, setCategoryChoice] = useState(area ? String(area.category.id) : '');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [rent, setRent] = useState<NewRent>({
    currency: 'IQD',
    monthlyPrice: null,
    vacant: false,
    startsFrom: yearMonthOf(today),
  });
  const [renter, setRenter] = useState<RenterInput>({
    name: currentRenter?.fullName ?? '',
    phone: currentRenter?.phone ?? '',
    since: dateStringFromLocal(today),
  });
  const [address, setAddress] = useState(area?.address ?? '');
  const [hasContractStart, setHasContractStart] = useState(area?.contractStart != null);
  const [contractStart, setContractStart] = useState<DateString>(
    area?.contractStart ?? dateStringFromLocal(today),
  );
  const [notes, setNotes] = useState(area?.notes ?? '');
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  // Mistakes the owner can fix before anything is sent.
  const required = t('common.requiredField');
  const fieldProblems = {
    name: name.trim() === '' ? required : null,
    category:
      categoryChoice === ''
        ? t('areaForm.problems.chooseCategory')
        : categoryChoice === NEW_CATEGORY && newCategoryName.trim() === ''
          ? required
          : null,
    rent:
      !area && !rent.vacant && rent.monthlyPrice === null
        ? t('areaForm.problems.rentRequired')
        : null,
    phone: PHONE_PATTERN.test(renter.phone) ? null : t('areaForm.problems.phone'),
    renterName:
      currentRenter && renter.name.trim() === ''
        ? t('areaForm.problems.renterNameKept')
        : renter.name.trim() === '' && renter.phone.trim() !== ''
          ? t('areaForm.problems.renterNameNeeded')
          : null,
  };
  const shown = (message: string | null) => (showProblems ? message : null);

  async function resolveCategoryId(): Promise<number | null> {
    if (categoryChoice !== NEW_CATEGORY) return Number(categoryChoice);
    const created = await callIpc('categories:create', { name: newCategoryName, color: null });
    if (!mounted.current) return null;
    if (!created.ok) {
      setProblem('unexpected');
      return null;
    }
    if (!created.data.ok) {
      setProblem('duplicate_category');
      return null;
    }
    // Keep the new category chosen, so a second try does not create it again.
    setCategoryChoice(String(created.data.id));
    categories.refresh();
    return created.data.id;
  }

  async function submit() {
    setShowProblems(true);
    setProblem(null);
    if (Object.values(fieldProblems).some(Boolean) || busy) return;
    setBusy(true);
    const categoryId = await resolveCategoryId();
    if (!mounted.current) return;
    if (categoryId === null) {
      setBusy(false);
      return;
    }
    const renterDetails =
      renter.name.trim() === '' ? null : { fullName: renter.name, phone: renter.phone };
    const common = {
      categoryId,
      name,
      address,
      contractStart: hasContractStart ? contractStart : null,
      notes,
    };
    const result = area
      ? await callIpc('areas:update', {
          id: area.id,
          ...common,
          ...(renterDetails && currentRenter ? { renter: renterDetails } : {}),
        })
      : await callIpc('areas:create', {
          ...common,
          currency: rent.currency,
          monthlyPrice: rent.vacant ? 0 : (rent.monthlyPrice ?? 0),
          rentStartsFrom: rent.startsFrom,
          renter: renterDetails && { ...renterDetails, startedOn: renter.since },
        });
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) setProblem('unexpected');
    else if (!result.data.ok) setProblem(result.data.reason);
    else void navigate(`/areas/${result.data.id}`, { state: flash(t('areaForm.saved')) });
  }

  return (
    <>
      <PageHeader title={t(area ? 'areaForm.editTitle' : 'areaForm.newTitle')} />
      <Form className={styles.form} onSubmit={() => void submit()}>
        <section className={styles.section}>
          <TextField
            label={t('areaForm.name')}
            value={name}
            onChange={setName}
            error={shown(fieldProblems.name)}
            maxLength={AREA_NAME_MAX}
            autoFocus
            dir="auto"
          />
          <SelectField
            label={t('areaForm.category')}
            value={categoryChoice}
            onChange={setCategoryChoice}
            error={categoryChoice === NEW_CATEGORY ? null : shown(fieldProblems.category)}
          >
            <option value="" disabled>
              {t('areaForm.chooseCategory')}
            </option>
            {categories.state.status === 'ready' &&
              categories.state.data.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            <option value={NEW_CATEGORY}>{t('areaForm.newCategory')}</option>
          </SelectField>
          {categories.state.status === 'error' && <LoadError onRetry={categories.reload} />}
          {categoryChoice === NEW_CATEGORY && (
            <TextField
              label={t('areaForm.newCategoryName')}
              value={newCategoryName}
              onChange={setNewCategoryName}
              error={shown(fieldProblems.category)}
              maxLength={CATEGORY_NAME_MAX}
              dir="auto"
            />
          )}
        </section>

        <section className={styles.section}>
          <RentFields
            area={area}
            rent={rent}
            onChange={setRent}
            rentError={shown(fieldProblems.rent)}
          />
        </section>

        {(!area || currentRenter) && (
          <RenterFields
            editing={area !== null}
            renter={renter}
            onChange={setRenter}
            nameError={shown(fieldProblems.renterName)}
            phoneError={shown(fieldProblems.phone)}
          />
        )}

        <section className={styles.section}>
          <TextField
            label={`${t('areaForm.address')} ${t('common.optional')}`}
            value={address}
            onChange={setAddress}
            maxLength={ADDRESS_MAX}
            dir="auto"
          />
          <Checkbox
            label={`${t('areaForm.contractStart')} ${t('common.optional')}`}
            checked={hasContractStart}
            onChange={setHasContractStart}
          />
          {hasContractStart && (
            <DateField
              label={t('areaForm.contractStart')}
              value={contractStart}
              onChange={setContractStart}
            />
          )}
          <label className={styles.notes}>
            <span>{`${t('areaForm.notes')} ${t('common.optional')}`}</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              maxLength={NOTES_MAX}
              dir="auto"
            />
          </label>
        </section>

        {problem && (
          <Notice tone="error">
            {problem === 'unexpected' ? t('errors.unexpected') : t(`areaForm.problems.${problem}`)}
          </Notice>
        )}
        <div className={styles.actions}>
          <BigButton type="submit" variant="primary" disabled={busy}>
            {t('areaForm.save')}
          </BigButton>
          <BigButton onClick={() => void navigate(-1)}>{t('common.cancel')}</BigButton>
        </div>
      </Form>
    </>
  );
}
