import type { AuditAction, AuditEntity } from '@shared/audit';
import type { Db } from '../connection';

/** Values worth keeping about a change: what it was before and after, names, months, amounts. */
export type AuditDetails = Record<string, unknown>;

export interface AuditRepository {
  /** Call inside the same transaction as the change, so the log never disagrees with the data. */
  record(action: AuditAction, entity: AuditEntity, entityId: number, details?: AuditDetails): void;
}

export function createAuditRepository(db: Db): AuditRepository {
  const insert = db.prepare<[string, string, number, string]>(
    'INSERT INTO audit_log (action, entity, entity_id, details_json) VALUES (?, ?, ?, ?)',
  );
  return {
    record(action, entity, entityId, details = {}) {
      insert.run(action, entity, entityId, JSON.stringify(details));
    },
  };
}
