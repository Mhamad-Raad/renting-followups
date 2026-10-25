import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { areaLabel, type AreaNaming } from '@shared/areas';

/** What an area is called on screen: its name, its renter's name, or "No name" (see `areaLabel`). */
export function useAreaLabel(): (area: AreaNaming) => string {
  const { t } = useTranslation();
  return useCallback(
    (area: AreaNaming) => areaLabel(area.name, area.renterName) ?? t('areas.noName'),
    [t],
  );
}
