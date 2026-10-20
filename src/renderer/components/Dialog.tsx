import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  title: string;
  /** Called for Esc; the parent decides whether to close. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * The one dialog frame of the app: dimmed background, fade and slight scale,
 * focus kept inside, Esc to close. Only one dialog is ever open at a time.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
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
        onClose();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {open && children}
    </dialog>
  );
}

/** The row of big buttons at the bottom of a dialog; the main action comes first. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
