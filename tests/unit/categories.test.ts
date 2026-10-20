import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../../src/main/db/connection';
import type { Repositories } from '../../src/main/db/repositories';
import { areaInput, createTestDatabase } from './helpers';

let db: Db;
let repos: Repositories;

beforeEach(() => {
  ({ db, repos } = createTestDatabase());
});
afterEach(() => db.close());

function auditActions() {
  return db.prepare('SELECT action, entity FROM audit_log ORDER BY id').all();
}

describe('categories', () => {
  it('creates, lists in creation order, and counts areas', () => {
    const houses = repos.categories.create({ name: 'Houses', color: '#2f6f9f' });
    const shops = repos.categories.create({ name: 'Shops', color: null });
    if (!houses.ok || !shops.ok) throw new Error('create failed');
    repos.areas.create(areaInput(houses.id));
    expect(repos.categories.list()).toEqual([
      { id: houses.id, name: 'Houses', color: '#2f6f9f', areaCount: 1 },
      { id: shops.id, name: 'Shops', color: null, areaCount: 0 },
    ]);
  });

  it('refuses a second category with the same name, ignoring case and letter variants', () => {
    repos.categories.create({ name: 'خانووەکان', color: null });
    expect(repos.categories.create({ name: '  خانووەكان ', color: null })).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
  });

  it('renames and recolours, and records the before and after', () => {
    const created = repos.categories.create({ name: 'Land', color: null });
    if (!created.ok) throw new Error('create failed');
    expect(
      repos.categories.update({ id: created.id, name: 'Farm land', color: '#3d8b5a' }),
    ).toEqual({
      ok: true,
      id: created.id,
    });
    const row = db.prepare("SELECT details_json FROM audit_log WHERE action = 'update'").get() as {
      details_json: string;
    };
    expect(JSON.parse(row.details_json)).toEqual({
      before: { name: 'Land', color: null },
      after: { name: 'Farm land', color: '#3d8b5a' },
    });
  });

  it('only deletes an empty category, and can restore it', () => {
    const created = repos.categories.create({ name: 'Companies', color: null });
    if (!created.ok) throw new Error('create failed');
    const area = repos.areas.create(areaInput(created.id));
    if (!area.ok) throw new Error('area failed');
    expect(repos.categories.softDelete(created.id)).toEqual({ ok: false, reason: 'has_areas' });

    repos.areas.softDelete(area.id);
    expect(repos.categories.softDelete(created.id)).toEqual({ ok: true });
    expect(repos.categories.list()).toEqual([]);
    expect(repos.categories.listDeleted().map((c) => c.name)).toEqual(['Companies']);

    expect(repos.categories.restore(created.id)).toEqual({ ok: true });
    expect(repos.categories.list().map((c) => c.name)).toEqual(['Companies']);
    expect(auditActions()).toContainEqual({ action: 'restore', entity: 'category' });
  });

  it('does not restore a category whose name was reused meanwhile', () => {
    const first = repos.categories.create({ name: 'Tourist', color: null });
    if (!first.ok) throw new Error('create failed');
    repos.categories.softDelete(first.id);
    repos.categories.create({ name: 'tourist', color: null });
    expect(repos.categories.restore(first.id)).toEqual({ ok: false, reason: 'duplicate_name' });
  });
});
