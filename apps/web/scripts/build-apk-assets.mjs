import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: webRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npx', ['vite', 'build'], { VITE_BASE: './' });
run('npx', ['cap', 'sync', 'android']);
