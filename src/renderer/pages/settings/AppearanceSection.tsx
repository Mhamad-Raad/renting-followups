import { useTranslation } from 'react-i18next';
import { FONT_FAMILIES, FONT_NAMES, SORANI_TEST_TEXT } from '@shared/fonts';
import { FONT_SIZES, THEME_COLORS } from '@shared/settings';
import { useSettings } from '../../app/SettingsContext';
import { ChoiceGroup } from '../../components/ChoiceGroup';
import { SwatchPicker } from '../../components/SwatchPicker';
import type { ChangeSettings } from './SettingsPage';
import styles from './SettingsPage.module.css';

/** Settings → Appearance: light or dark, theme colour, font and text size, all applied at once. */
export function AppearanceSection({ change }: { change: ChangeSettings }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return (
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
      <SwatchPicker
        label={t('settings.themeColor')}
        value={settings.themeColor}
        // Each swatch shows the colour as it looks in the current light or dark mode.
        swatches={THEME_COLORS.map((color) => ({
          value: color,
          color: `var(--accent-${color})`,
          tickColor: `var(--accent-${color}-on)`,
          label: t(`settings.themeColors.${color}`),
        }))}
        onChange={(themeColor) => change({ themeColor })}
      />
      <ChoiceGroup
        label={t('settings.font')}
        value={settings.fontFamily}
        choices={FONT_FAMILIES.map((font) => ({
          value: font,
          label: FONT_NAMES[font],
          fontFamily: `'${FONT_NAMES[font]}'`,
          sample: SORANI_TEST_TEXT,
        }))}
        onChange={(fontFamily) => change({ fontFamily })}
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
  );
}
