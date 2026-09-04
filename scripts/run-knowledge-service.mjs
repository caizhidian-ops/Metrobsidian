import { spawn } from 'node:child_process';
import { platform } from 'node:os';

const candidates = process.env.PYTHON
  ? [process.env.PYTHON]
  : platform() === 'win32'
    ? ['py', 'python']
    : ['python3', 'python'];

let command = null;
for (const candidate of candidates) {
  const child = spawn(candidate, ['--version'], { stdio: 'ignore' });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code === 0) { command = candidate; break; }
}
if (!command) throw new Error('Python 3 was not found. Set PYTHON to its executable path.');

const child = spawn(command, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
  cwd: new URL('../services/knowledge/', import.meta.url),
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
