// Development only: starts the app on the demo data (npm run demo), making it first if needed.
// The password is demo1234. The demo folder is separate from any other data.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const folder = join(root, 'demo-data');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(join(folder, 'rent-tracker.db'))) {
  const made = spawnSync(npm, ['run', 'seed', '--', folder, '5'], { cwd: root, stdio: 'inherit' });
  if (made.status !== 0) process.exit(made.status ?? 1);
}
console.log('Opening the app on the demo data. Password: demo1234');
spawn(npm, ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, RENT_TRACKER_DATA_DIR: folder },
}).on('exit', (code) => process.exit(code ?? 0));
