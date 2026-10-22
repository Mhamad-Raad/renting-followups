import styles from './print.module.css';

interface PrintHeaderProps {
  logo: string | null;
  /** The owner's print title from Settings; nothing is shown when it is empty. */
  printTitle: string;
  /** The report or receipt title. */
  title: string;
  /** Short lines under the title, such as the filters used and the date. */
  details?: readonly string[];
}

/** The top of every printed page, also shown as the preview in Settings. */
export function PrintHeader({ logo, printTitle, title, details = [] }: PrintHeaderProps) {
  return (
    <header className={styles.header}>
      {logo && <img className={styles.logo} src={logo} alt="" />}
      {printTitle && (
        <p className={styles.owner} dir="auto">
          {printTitle}
        </p>
      )}
      <h1 className={styles.title}>{title}</h1>
      {details.map((line) => (
        <p key={line} className={styles.detail}>
          {line}
        </p>
      ))}
    </header>
  );
}
