/** The id in an address such as `/areas/12` or `/print/receipt/4`, or null when it is not a valid id. */
export function parseRouteId(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d{0,9}$/.test(value)) return null;
  return Number(value);
}
