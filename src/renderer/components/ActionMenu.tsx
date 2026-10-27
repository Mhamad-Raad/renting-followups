import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import styles from './ActionMenu.module.css';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  /** 'danger' for an action that removes something; it is set apart at the end. */
  tone?: 'danger';
}

interface ActionMenuProps {
  /** Read out for the ⋯ button, for example "Actions for Shop 4". */
  label: string;
  items: readonly ActionMenuItem[];
}

/**
 * A ⋯ button that opens a short list of actions beside it. Esc or a click
 * elsewhere closes it, and the arrow keys move between the actions.
 */
export function ActionMenu({ label, items }: ActionMenuProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // The browser opens and closes the popover (button, Esc, click outside); follow it here.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === 'open';
      setOpen(isOpen);
      if (isOpen) menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    };
    menu.addEventListener('toggle', onToggle);
    return () => menu.removeEventListener('toggle', onToggle);
  }, []);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === 'ArrowDown'
        ? buttons[(index + 1) % buttons.length]
        : event.key === 'ArrowUp'
          ? buttons[(index - 1 + buttons.length) % buttons.length]
          : event.key === 'Home'
            ? buttons[0]
            : event.key === 'End'
              ? buttons.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        popoverTarget={menuId}
      >
        <Icon name="more" className={styles.dots} />
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={label}
        className={styles.menu}
        onKeyDown={moveFocus}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.tone === 'danger' ? `${styles.item} ${styles.danger}` : styles.item}
            onClick={() => {
              menuRef.current?.hidePopover();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
