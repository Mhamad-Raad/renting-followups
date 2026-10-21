import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DIGIT_STYLES, toDigitStyle } from '@shared/digits';
import type { IpcErrorCode } from '@shared/ipc';
import { FONT_SIZES, LANGUAGES, type SettingsUpdate } from '@shared/settings';
import { useSettings } from '../app/SettingsContext';
import { ChoiceGroup } from '../components/ChoiceGroup';
import { Notice } from '../components/Notice';
import { LinkButton } from '../components/LinkButton';
import { PageHeader } from '../components/PageHeader';
import { LANGUAGE_NAMES } from '../i18n';
import { SecuritySection } from './SecuritySection';
import styles from './SettingsPage.module.css';

/** Language, number style, light/dark, text size and security so far; the rest comes in iteration 10. */
export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [error, setError] = useState<IpcErrorCode | null>(null);

  const change = (changes: SettingsUpdate) => {
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

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.appearance')}</h2>
        <ChoiceGroup
          label={t('settings.themeMode')}
          value={settings.themeMode}
          choices={[
            { value: 'light', label: t('settings.light') },
            { value: 'dark', label: t('settings.dark') },
          ]}
          onChange={(themeMode) => change({ themeMode })}
        />
        <ChoiceGroup
          label={t('settings.fontSize')}
          value={settings.fontSize}
          choices={FONT_SIZES.map((size) => ({
            value: size,
            label: t(`settings.fontSizes.${size}`),
          }))}
          onChange={(fontSize) => change({ fontSize })}
        />
      </section>

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
