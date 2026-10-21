/** Added to an area's address to open it with the payment form showing. */
export const RECORD_PAYMENT_PARAM = 'pay';

export const areaLink = (id: number) => `/areas/${id}`;

/** Opens the area with Record payment already open, for example from Home. */
export const recordPaymentLink = (id: number) => `${areaLink(id)}?${RECORD_PAYMENT_PARAM}=1`;
