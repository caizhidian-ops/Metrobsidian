import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';

const candidates = process.env.PYTHON
  ? [process.env.PYTHON]
  : platform() === 'win32'
    ? ['py', 'python']
    : ['python3', 'python'];

let selected = null;
for (const command of candidates) {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore' });
  if (probe.status === 0) { selected = command; break; }
}
if (!selected) {
  console.error('Python 3 was not found. Set the PYTHON environment variable.');
  process.exit(1);
}

const result = spawnSync(selected, ['run_tests.py'], {
  cwd: new URL('../services/knowledge/', import.meta.url),
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
