import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CATEGORY_COLORS,
  CATEGORY_NAME_MAX,
  type Category,
  type CategoryColor,
} from '@shared/categories';
import { formatPlain } from '@shared/formatNumber';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { CategoryDot } from '../../components/CategoryDot';
import { SwatchPicker } from '../../components/SwatchPicker';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog, DialogActions } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { Form } from '../../components/Form';
import { LoadError } from '../../components/LoadError';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { TextField } from '../../components/TextField';
import styles from './CategoriesPage.module.css';

type Editing = { category: Category | null } | null;

/** Add, rename, recolour and delete the groups that areas belong to. */
export function CategoriesPage() {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const { settings } = useSettings();
  const categories = useIpcQuery('categories:list');
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const saved = () => {
    setEditing(null);
    setMessage({ tone: 'success', text: t('categories.saved') });
    categories.refresh();
  };

  // A category with areas cannot be deleted: say why at once instead of asking first.
  const askToDelete = (category: Category) => {
    if (category.areaCount > 0) setMessage({ tone: 'error', text: t('categories.has_areas') });
    else setDeleting(category);
  };

  const remove = async (category: Category) => {
    setDeleting(null);
    const result = await callIpc('categories:delete', { id: category.id });
    if (!mounted.current) return;
    if (!result.ok) setMessage({ tone: 'error', text: t('errors.unexpected') });
    else if (!result.data.ok)
      setMessage({ tone: 'error', text: t(`categories.${result.data.reason}`) });
    else {
      setMessage({ tone: 'success', text: t('categories.deleted') });
      categories.refresh();
    }
  };

  return (
    <>
      <PageHeader
        title={t('categories.title')}
        back={{ to: '/areas', label: t('area.back') }}
        actions={
          <BigButton variant="primary" onClick={() => setEditing({ category: null })}>
            {t('categories.add')}
          </BigButton>
        }
      />
      <div className={styles.stack}>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {categories.state.status === 'error' && <LoadError onRetry={categories.reload} />}
        {categories.state.status === 'ready' &&
          (categories.state.data.length === 0 ? (
            <EmptyState title={t('categories.empty')} />
          ) : (
            <ul className={styles.list}>
              {categories.state.data.map((category) => (
                <li key={category.id} className={styles.row}>
                  <CategoryDot color={category.color} />
                  <span className={styles.name}>{category.name}</span>
                  <span className={styles.count}>
                    {t('categories.areaCount', {
                      number: formatPlain(category.areaCount, settings.digitStyle),
                    })}
                  </span>
                  <BigButton onClick={() => setEditing({ category })}>{t('common.edit')}</BigButton>
                  <BigButton onClick={() => askToDelete(category)}>{t('common.delete')}</BigButton>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <Dialog
        open={editing !== null}
        title={t(editing?.category ? 'categories.editTitle' : 'categories.add')}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <CategoryForm
            category={editing.category}
            onSaved={saved}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        title={t('categories.deleteTitle')}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => setDeleting(null)}
      >
        {t('categories.deleteBody')}
      </ConfirmDialog>
    </>
  );
}

interface CategoryFormProps {
  category: Category | null;
  onSaved: () => void;
  onCancel: () => void;
}

function CategoryForm({ category, onSaved, onCancel }: CategoryFormProps) {
  const { t } = useTranslation();
  const mounted = useMountedRef();
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState<CategoryColor | null>(category?.color ?? null);
  const [showProblems, setShowProblems] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameProblem = name.trim() === '' ? t('common.requiredField') : null;

  const submit = async () => {
    setShowProblems(true);
    if (nameProblem || busy) return;
    setBusy(true);
    const result = category
      ? await callIpc('categories:update', { id: category.id, name, color })
      : await callIpc('categories:create', { name, color });
    if (result.ok && result.data.ok) {
      onSaved();
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) setProblem(t('errors.unexpected'));
    else if (!result.data.ok) setProblem(t(`categories.${result.data.reason}`));
  };

  return (
    <Form className={styles.form} onSubmit={() => void submit()}>
      <TextField
        label={t('categories.name')}
        value={name}
        onChange={setName}
        error={showProblems ? nameProblem : null}
        maxLength={CATEGORY_NAME_MAX}
        autoFocus
        dir="auto"
      />
      <SwatchPicker
        label={t('categories.color')}
        value={color}
        swatches={[
          { value: null, color: null, label: t('categories.noColor'), showLabel: true },
          ...CATEGORY_COLORS.map((value) => ({ value, color: value, label: value })),
        ]}
        onChange={setColor}
      />
      {problem && <Notice tone="error">{problem}</Notice>}
      <DialogActions>
        <BigButton type="submit" variant="primary" disabled={busy}>
          {t('common.save')}
        </BigButton>
        <BigButton onClick={onCancel}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Form>
  );
}
