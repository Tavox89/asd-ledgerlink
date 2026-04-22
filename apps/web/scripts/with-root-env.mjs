import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, '../../..');
const envPath = resolve(workspaceRoot, '.env');

if (!existsSync(envPath)) {
  console.error(`Missing root .env file at ${envPath}`);
  process.exit(1);
}

const parsedEnv = dotenv.parse(readFileSync(envPath));
delete parsedEnv.NODE_ENV;
const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('No command provided to with-root-env.mjs');
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...parsedEnv,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
