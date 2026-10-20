import { toDigitStyle, toWesternDigits } from '@shared/digits';
import { useSettings } from '../app/SettingsContext';

/** A phone number in the chosen digit style, kept left to right inside RTL text. */
export function PhoneText({ phone }: { phone: string }) {
  const { settings } = useSettings();
  return <bdi dir="ltr">{toDigitStyle(toWesternDigits(phone), settings.digitStyle)}</bdi>;
}
