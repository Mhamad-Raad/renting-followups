/** Added to an area's address to open it with one of its dialogs showing. */
export const AREA_ACTION_PARAM = 'do';

/** The area page dialogs that can be opened from elsewhere, such as the Areas list's ⋯ menu. */
export const AREA_ACTIONS = [
  'payment',
  'pastPayment',
  'changePrice',
  'markVacant',
  'setRentAgain',
  'changeRenter',
  'delete',
] as const;

export type AreaAction = (typeof AREA_ACTIONS)[number];

export function isAreaAction(value: string | null): value is AreaAction {
  return (AREA_ACTIONS as readonly (string | null)[]).includes(value);
}

export const areaLink = (id: number) => `/areas/${id}`;

export const editAreaLink = (id: number) => `${areaLink(id)}/edit`;

/** Opens the area with the given dialog already open. */
export const areaActionLink = (id: number, action: AreaAction) =>
  `${areaLink(id)}?${AREA_ACTION_PARAM}=${action}`;

/** Opens the area with Record payment already open, for example from Home. */
export const recordPaymentLink = (id: number) => areaActionLink(id, 'payment');
