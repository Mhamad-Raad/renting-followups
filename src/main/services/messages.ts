import ar from '../../renderer/i18n/ar.json';
import ckb from '../../renderer/i18n/ckb.json';
import en from '../../renderer/i18n/en.json';

/**
 * For the rare message the main process must show before the screen can load
 * (for example when the data cannot be opened). The saved language may be
 * unreadable then, so the message is given in all three languages.
 */
export function startupFailureMessage(): { title: string; body: string } {
  return {
    title: [ckb, en, ar].map((strings) => strings.app.name).join(' · '),
    body: [ckb, en, ar].map((strings) => strings.startup.failed).join('\n\n'),
  };
}
