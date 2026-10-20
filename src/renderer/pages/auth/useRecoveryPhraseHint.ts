import { useTranslation } from 'react-i18next';
import { MIN_RECOVERY_PHRASE_LENGTH } from '@shared/auth';
import { formatPlain } from '@shared/formatNumber';
import { useSettings } from '../../app/SettingsContext';

/** "A sentence only you know… At least 8 letters.", with the number in the chosen digit style. */
export function useRecoveryPhraseHint(): string {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return t('auth.recoveryPhraseHint', {
    min: formatPlain(MIN_RECOVERY_PHRASE_LENGTH, settings.digitStyle),
  });
}
