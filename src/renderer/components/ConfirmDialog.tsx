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
  /** The button that changes nothing; "Cancel" unless that would be confusing. */
  cancelLabel?: string;
  /** Use 'danger' for deletes and cancellations. */
  tone?: 'normal' | 'danger';
  /** Puts the keyboard on Cancel, so a stray Enter changes nothing (for the weightiest actions). */
  focusCancel?: boolean;
  /** While the answer is being saved: both buttons wait, and the question cannot be closed. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks one plain question with two big answers. Esc or the cancel button closes it; Enter confirms. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'normal',
  focusCancel = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} title={title} onClose={busy ? () => undefined : onCancel}>
      <div className={styles.body}>{children}</div>
      <DialogActions>
        <BigButton
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          autoFocus={!focusCancel}
          disabled={busy}
        >
          {confirmLabel}
        </BigButton>
        <BigButton onClick={onCancel} autoFocus={focusCancel} disabled={busy}>
          {cancelLabel ?? t('common.cancel')}
        </BigButton>
      </DialogActions>
    </Dialog>
  );
}
