import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState';
import { LinkButton } from '../../components/LinkButton';

/** The first thing a new owner sees on Home and Areas: add one area, or bring them all in from Excel. */
export function NoAreasYet() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('areas.empty.title')}
      body={t('areas.empty.body')}
      action={
        <>
          <LinkButton to="/areas/new" variant="primary">
            {t('areas.empty.button')}
          </LinkButton>
          <LinkButton to="/areas/import" icon="download">
            {t('areas.empty.importButton')}
          </LinkButton>
        </>
      }
    />
  );
}
