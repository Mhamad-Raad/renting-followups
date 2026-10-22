/**
 * Demo data for development only (ARCHITECTURE.md section 16): 200 areas with
 * three years of mixed payments, for performance and screen testing. It
 * writes to its own folder and is never part of the app or the installer.
 *
 *   npm run seed                 creates ./demo-data
 *   npm run seed -- <folder>     creates it somewhere else
 *
 * Then start the app on it (password "demo1234"), for example in PowerShell:
 *   $env:RENT_TRACKER_DATA_DIR="demo-data"; npm run dev
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CategoryColor } from '@shared/categories';
import type { Currency } from '@shared/currency';
import {
  daysInMonth,
  fromMonthIndex,
  monthIndex,
  toDateString,
  type YearMonth,
} from '@shared/dates';
import { createConnection } from '../src/main/db/connection';
import { loadMigrations, migrate } from '../src/main/db/migrate';
import { createRepositories } from '../src/main/db/repositories';
import { createAuthService } from '../src/main/services/auth';

const AREAS = 200;
const YEARS_OF_HISTORY = 3;
const PASSWORD = 'demo1234';
const RECOVERY_PHRASE = 'demo recovery phrase';
/** Marks a folder made by this script, so it is the only kind ever replaced. */
const MARKER = '.rent-tracker-demo';

const CATEGORIES: { name: string; color: CategoryColor; prefix: string }[] = [
  { name: 'دووکانەکان', color: '#2f6f9f', prefix: 'دووکانی' },
  { name: 'شوقەکان', color: '#3d8b5a', prefix: 'شوقەی' },
  { name: 'نووسینگەکان', color: '#b7791f', prefix: 'نووسینگەی' },
  { name: 'کۆگاکان', color: '#7a5ba6', prefix: 'کۆگای' },
  { name: 'Houses', color: '#2f8f8f', prefix: 'House' },
];
const FIRST_NAMES = [
  'ئەحمەد',
  'کاروان',
  'هێمن',
  'شیلان',
  'ئاراس',
  'سارا',
  'Omar',
  'Lana',
  'دلشاد',
  'ڕێباز',
  'Nawroz',
  'هاوژین',
];
const LAST_NAMES = ['عەلی', 'محەمەد', 'حەسەن', 'Karim', 'ئیبراهیم', 'Aziz', 'قادر', 'ڕەشید'];

/** A small seeded random generator, so every run makes the same data. */
function randomFrom(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (probability: number) => next() < probability,
  };
}

/** The app's migrations, read from disk (the app itself gets them bundled by Vite). */
function readMigrations() {
  const folder = resolve(import.meta.dirname, '../src/main/db/migrations');
  return loadMigrations(
    Object.fromEntries(
      readdirSync(folder)
        .filter((name) => name.endsWith('.sql'))
        .map((name) => [`./${name}`, readFileSync(join(folder, name), 'utf8')]),
    ),
  );
}

function prepareFolder(folder: string): void {
  if (existsSync(folder)) {
    if (readdirSync(folder).length > 0 && !existsSync(join(folder, MARKER))) {
      throw new Error(
        `${folder} is not empty and was not made by this script; nothing was changed.`,
      );
    }
    rmSync(folder, { recursive: true, force: true });
  }
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, MARKER), 'Demo data made by npm run seed.\n');
}

async function main(): Promise<void> {
  const folder = resolve(process.argv[2] ?? 'demo-data');
  prepareFolder(folder);
  const db = createConnection(join(folder, 'rent-tracker.db'));
  try {
    migrate(db, readMigrations());
    const repos = createRepositories(db);
    await createAuthService(repos.credentials).setup({
      password: PASSWORD,
      recoveryPhrase: RECOVERY_PHRASE,
    });

    const random = randomFrom(20261022);
    const now = new Date();
    const thisMonth: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const today = {
      date: toDateString(thisMonth.year, thisMonth.month, now.getDate()),
      month: thisMonth,
    };
    const firstMonth = monthIndex({ year: thisMonth.year - YEARS_OF_HISTORY + 1, month: 1 });
    const categoryIds = CATEGORIES.map((category) => {
      const created = repos.categories.create({ name: category.name, color: category.color });
      if (!created.ok) throw new Error('category not created');
      return created.id;
    });

    let receipts = 0;
    db.transaction(() => {
      for (let number = 1; number <= AREAS; number += 1) {
        const which = random.int(0, CATEGORIES.length - 1);
        const currency: Currency = random.chance(0.8) ? 'IQD' : 'USD';
        const price = currency === 'IQD' ? random.int(6, 60) * 25_000 : random.int(20, 200) * 1_000;
        const start = fromMonthIndex(random.int(firstMonth, monthIndex(thisMonth)));
        const area = repos.areas.create({
          categoryId: categoryIds[which] ?? 0,
          name: `${CATEGORIES[which]?.prefix ?? ''} ${number}`,
          currency,
          monthlyPrice: price,
          rentStartsFrom: start,
          renter: random.chance(0.9)
            ? {
                fullName: `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`,
                phone: `07${random.int(50, 51)}${random.int(1_000_000, 9_999_999)}`,
                startedOn: toDateString(start.year, start.month, 1),
              }
            : null,
          address: random.chance(0.5) ? `شەقامی ${random.int(1, 60)}` : '',
          contractStart: null,
          notes: '',
        });
        if (!area.ok) throw new Error(`area ${number} not created`);

        // About one area in six gets a new rent part way through.
        const months = monthIndex(thisMonth) - monthIndex(start);
        if (months > 6 && random.chance(1 / 6)) {
          repos.priceChanges.changePrice(
            {
              areaId: area.id,
              from: fromMonthIndex(monthIndex(start) + random.int(3, months)),
              monthlyPrice: random.chance(0.2) ? 0 : Math.round(price * 1.1),
            },
            thisMonth,
          );
        }

        // Most months are paid on time, some only in part, some not yet (late).
        const reliable = random.next();
        for (let index = monthIndex(start); index <= monthIndex(thisMonth); index += 1) {
          if (random.next() > 0.6 + reliable * 0.38) continue;
          const month = fromMonthIndex(index);
          const day = random.int(1, Math.min(daysInMonth(month.year, month.month), 28));
          const paidOn = toDateString(month.year, month.month, day);
          if (paidOn > today.date) continue;
          const result = repos.payments.create(
            {
              areaId: area.id,
              // Payments before this year are past records, as when bringing in old notebooks.
              isBackfill: month.year < thisMonth.year,
              amount: random.chance(0.1) ? Math.round(price / 2) : price,
              from: month,
              paidOn,
              note: '',
            },
            today,
          );
          if (result.ok) receipts += 1;
        }
      }
    })();
    console.log(`Made ${AREAS} areas and ${receipts} payments in ${folder}`);
    console.log(`Password: ${PASSWORD}`);
  } finally {
    db.close();
  }
}

await main();
