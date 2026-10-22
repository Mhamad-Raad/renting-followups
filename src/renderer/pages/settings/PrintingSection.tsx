import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPlain } from '@shared/formatNumber';
import { formatReceiptNumber } from '@shared/payments';
import { LOGO_MAX_MEGABYTES, PRINT_TITLE_MAX } from '@shared/settings';
import { callIpc, useIpcQuery } from '../../app/ipc';
import { useMountedRef } from '../../app/useMountedRef';
import { useSettings } from '../../app/SettingsContext';
import { BigButton } from '../../components/BigButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Form } from '../../components/Form';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import printStyles from '../../print/print.module.css';
import { PrintHeader } from '../../print/PrintHeader';
import styles from './SettingsPage.module.css';

interface Message {
  tone: 'success' | 'error';
  text: string;
}

/**
 * Settings → Printing: the title and logo on every printed receipt and
 * report, with a preview of a receipt's top that follows the typing.
 */
export function PrintingSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const logo = useIpcQuery('settings:logo');
  const [title, setTitle] = useState(settings.printTitle);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const logoSrc = logo.state.status === 'ready' ? logo.state.data : null;
  const maxSize = formatPlain(LOGO_MAX_MEGABYTES, settings.digitStyle);
  const mounted = useMountedRef();
  const titleChanged = title.trim() !== settings.printTitle;

  // Saved with the button, with Enter, and when leaving the box (also by going to another page),
  // so a typed title is never lost.
  const saveTitle = async () => {
    if (!titleChanged) return;
    const result = await updateSettings({ printTitle: title });
    if (!mounted.current) return;
    if (result.ok) setTitle(title.trim());
    setMessage(
      result.ok
        ? { tone: 'success', text: t('settings.titleSaved') }
        : { tone: 'error', text: t('settings.saveFailed') },
    );
  };

  const chooseLogo = async () => {
    setBusy(true);
    setMessage(null);
    const result = await callIpc('settings:chooseLogo');
    if (!mounted.current) return;
    setBusy(false);
    if (!result.ok) return setMessage({ tone: 'error', text: t('settings.logoFailed') });
    const outcome = result.data;
    if (!outcome.ok) {
      return setMessage({
        tone: 'error',
        text: t(`settings.logoProblems.${outcome.reason}`, { size: maxSize }),
      });
    }
    if (outcome.done === 'saved') {
      logo.refresh();
      setMessage({ tone: 'success', text: t('settings.logoSaved') });
    }
  };

  const removeLogo = async () => {
    setConfirmRemove(false);
    const result = await callIpc('settings:removeLogo');
    if (!mounted.current) return;
    logo.refresh();
    setMessage(
      result.ok
        ? { tone: 'success', text: t('settings.logoRemoved') }
        : { tone: 'error', text: t('settings.logoFailed') },
    );
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('settings.printing')}</h2>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Form className={styles.titleRow} onSubmit={() => void saveTitle()}>
        <TextField
          label={t('settings.printTitle')}
          hint={t('settings.printTitleHint')}
          value={title}
          onChange={setTitle}
          onBlur={() => void saveTitle()}
          maxLength={PRINT_TITLE_MAX}
          dir="auto"
        />
        <BigButton type="submit" disabled={!titleChanged}>
          {t('common.save')}
        </BigButton>
      </Form>

      <div className={styles.logoRow}>
        <span className={styles.label}>{t('settings.logo')}</span>
        <p className={styles.hint}>{t('settings.logoHint', { size: maxSize })}</p>
        <div className={styles.buttonRow}>
          <BigButton onClick={() => void chooseLogo()} disabled={busy}>
            {t(logoSrc ? 'settings.changeLogo' : 'settings.chooseLogo')}
          </BigButton>
          {logoSrc && (
            <BigButton onClick={() => setConfirmRemove(true)}>{t('settings.removeLogo')}</BigButton>
          )}
        </div>
      </div>

      <figure className={styles.preview}>
        <figcaption className={styles.label}>{t('settings.preview')}</figcaption>
        <div className={`${printStyles.paper} ${styles.previewPaper}`}>
          <PrintHeader
            logo={logoSrc}
            printTitle={title.trim()}
            titleAs="p"
            title={t('print.receiptNumber', {
              number: formatReceiptNumber(1, settings.digitStyle),
            })}
          />
        </div>
      </figure>

      <ConfirmDialog
        open={confirmRemove}
        title={t('settings.removeLogo')}
        confirmLabel={t('settings.removeLogo')}
        tone="danger"
        onConfirm={() => void removeLogo()}
        onCancel={() => setConfirmRemove(false)}
      >
        {t('settings.removeLogoQuestion')}
      </ConfirmDialog>
    </section>
  );
}
