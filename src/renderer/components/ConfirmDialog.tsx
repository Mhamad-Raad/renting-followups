import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BigButton } from './BigButton';
import styles from './ConfirmDialog.module.css';

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

/**
 * Asks one plain question with two big answers. Esc or the cancel button
 * closes it; Enter confirms. Only one dialog is ever open at a time.
 */
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: let React decide, so the open prop stays the single source of truth.
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      <div className={styles.actions}>
        <BigButton variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </BigButton>
        <BigButton onClick={onCancel}>{t('common.cancel')}</BigButton>
      </div>
    </dialog>
  );
}
