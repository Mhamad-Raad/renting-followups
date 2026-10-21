/** What happened, for the activity log. Translated on screen; stored as these codes. */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'restore',
  'change_price',
  'change_renter',
  'end_renter',
  'void',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = ['category', 'area', 'receipt'] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
