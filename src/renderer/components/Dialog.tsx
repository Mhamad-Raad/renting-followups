import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  title: string;
  /** Called for Esc or a click on the dark background; the parent decides whether to close. */
  onClose: () => void;
  /** 'wide' for a form with long rows of buttons; 'large' for a long list, such as the reminders on opening. */
  size?: 'normal' | 'wide' | 'large';
  children: ReactNode;
}

/** True when the press is on the dark background, not on the dialog (its padding counts as the dialog). */
function onBackground(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}

/**
 * The one dialog frame of the app: dimmed background, fade and slight scale,
 * focus kept inside, Esc or a click on the dark background to close. Only one
 * dialog is ever open at a time.
 */
export function Dialog({ open, title, onClose, size = 'normal', children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Only a press that starts and ends on the background closes it; selecting text
  // inside and letting go outside does not.
  const pressedBackground = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Opening a dialog focuses its first control; prefer the field that asked for focus.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={size === 'normal' ? styles.dialog : `${styles.dialog} ${styles[size]}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: let React decide, so the open prop stays the single source of truth.
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        pressedBackground.current = onBackground(event);
      }}
      onClick={(event) => {
        if (pressedBackground.current && onBackground(event)) onClose();
        pressedBackground.current = false;
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
