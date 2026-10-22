import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DIGIT_STYLES, toDigitStyle } from '@shared/digits';
import type { IpcErrorCode } from '@shared/ipc';
import { LANGUAGES, type SettingsUpdate } from '@shared/settings';
import { useSettings } from '../../app/SettingsContext';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { LinkButton } from '../../components/LinkButton';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { LANGUAGE_NAMES } from '../../i18n';
import { AppearanceSection } from './AppearanceSection';
import { PrintingSection } from './PrintingSection';
import { RemindersSection } from './RemindersSection';
import { SecuritySection } from './SecuritySection';
import styles from './SettingsPage.module.css';

/** Saves a change; it shows at once, and a failed save shows one message at the top. */
export type ChangeSettings = (changes: SettingsUpdate) => void;

/** One page of big sections (ARCHITECTURE.md section 12); every change applies immediately. */
export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [error, setError] = useState<IpcErrorCode | null>(null);

  const change: ChangeSettings = (changes) => {
    void updateSettings(changes).then((result) => setError(result.ok ? null : result.error));
  };

  return (
    <>
      <PageHeader title={t('pages.settings.title')} />
      {error && <Notice tone="error">{t('settings.saveFailed')}</Notice>}

      <section className={styles.section}>
        <ChoiceGroup
          label={t('settings.language')}
          value={settings.language}
          choices={LANGUAGES.map((language) => ({
            value: language,
            label: LANGUAGE_NAMES[language],
            lang: language,
          }))}
          onChange={(language) => change({ language })}
        />
        <ChoiceGroup
          label={t('settings.digitStyle')}
          value={settings.digitStyle}
          // Each option shows the digits it stands for.
          choices={DIGIT_STYLES.map((style) => ({
            value: style,
            label: toDigitStyle('1 2 3', style),
            ltr: true,
          }))}
          onChange={(digitStyle) => change({ digitStyle })}
        />
      </section>

      <AppearanceSection change={change} />
      <PrintingSection />
      <RemindersSection change={change} />
      <SecuritySection />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.data')}</h2>
        <div className={styles.buttonRow}>
          <LinkButton to="/settings/deleted">{t('deletedItems.open')}</LinkButton>
        </div>
      </section>
    </>
  );
}
