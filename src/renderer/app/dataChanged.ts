import { useEffect } from 'react';

const DATA_CHANGED = 'rent-tracker:data-changed';

/** Called after a save that changed the rent data (see `CHANGES_DATA`). */
export function announceDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/** Runs `onChange` after every such save; the listener is removed when the component goes. */
export function useDataChanged(onChange: () => void): void {
  useEffect(() => {
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [onChange]);
}
