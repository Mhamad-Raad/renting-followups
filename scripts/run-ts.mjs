// Runs a TypeScript script with the app's `@shared` path, for dev-only scripts such as seed.ts.
import { resolve } from 'node:path';
import { createJiti } from 'jiti';

const root = resolve(import.meta.dirname, '..');
const jiti = createJiti(import.meta.url, { alias: { '@shared': resolve(root, 'src/shared') } });
const [script] = process.argv.splice(2, 1);
if (!script) throw new Error('Usage: node scripts/run-ts.mjs <script.ts> [arguments]');
await jiti.import(resolve(script));
