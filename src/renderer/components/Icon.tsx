import styles from './Icon.module.css';

/** Simple line icons, drawn on a 24×24 grid. */
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9v12h14V9M10 21v-6h4v6',
  areas:
    'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1',
  reports: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  notifications: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  sidebar: 'M4 4h16v16H4zM9 4v16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M19 12H5M11 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  alert: 'M12 3 2 20h20zM12 9v5M12 17h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff:
    'M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2',
} as const;

export type IconName = keyof typeof ICONS;

/** Icons that point somewhere are mirrored in right-to-left languages. */
const DIRECTIONAL: ReadonlySet<IconName> = new Set(['back']);

interface IconProps {
  name: IconName;
  className?: string | undefined;
}

export function Icon({ name, className }: IconProps) {
  const classes = [styles.icon, DIRECTIONAL.has(name) ? styles.directional : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg className={classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}
