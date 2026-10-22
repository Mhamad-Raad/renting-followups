import styles from './print.module.css';

interface PrintHeaderProps {
  logo: string | null;
  /** The owner's print title from Settings; nothing is shown when it is empty. */
  printTitle: string;
  /** The report or receipt title. */
  title: string;
  /** Short lines under the title, such as the filters used and the date. */
  details?: readonly string[];
  /** A heading on paper; plain text in the Settings preview, so that page keeps one main heading. */
  titleAs?: 'h1' | 'p';
}

/** The top of every printed page, also shown as the preview in Settings. */
export function PrintHeader({
  logo,
  printTitle,
  title,
  details = [],
  titleAs: Title = 'h1',
}: PrintHeaderProps) {
  return (
    <header className={styles.header}>
      {logo && <img className={styles.logo} src={logo} alt="" />}
      {printTitle && (
        <p className={styles.owner} dir="auto">
          {printTitle}
        </p>
      )}
      <Title className={styles.title}>{title}</Title>
      {details.map((line) => (
        <p key={line} className={styles.detail}>
          {line}
        </p>
      ))}
    </header>
  );
}
