import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BigButton } from './BigButton';
import { Dialog, DialogActions } from './Dialog';
import styles from './Dialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Use 'danger' for deletes and cancellations. */
  tone?: 'normal' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks one plain question with two big answers. Esc or the cancel button closes it; Enter confirms. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'normal',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      <div className={styles.body}>{children}</div>
      <DialogActions>
        <BigButton variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </BigButton>
        <BigButton onClick={onCancel}>{t('common.cancel')}</BigButton>
      </DialogActions>
    </Dialog>
  );
}
