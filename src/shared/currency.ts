export const CURRENCIES = ['IQD', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Money is stored as an integer in the currency's smallest unit:
 * whole dinars for IQD, cents for USD.
 */
export const FRACTION_DIGITS: Record<Currency, number> = {
  IQD: 0,
  USD: 2,
};
