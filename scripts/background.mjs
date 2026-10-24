// Detached process groups survive an autonomous shell's exit; each launcher records only its own PID.
import { spawn } from 'node:child_process';
import { openSync, closeSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const [name, directory, logFile, executable, ...args] = process.argv.slice(2);
if (!name || !/^[a-z-]+$/.test(name) || !directory || !logFile || !executable) throw new Error('Usage: background.mjs service cwd logfile executable [args...]');
mkdirSync('.logs', { recursive: true });
const fd = openSync(path.resolve(logFile), 'w', 0o600);
const child = spawn(executable, args, { cwd: path.resolve(directory), env: process.env, detached: true, stdio: ['ignore', fd, fd] });
child.on('error', error => { console.error(`Could not start ${name}: ${error.message}`); process.exitCode = 1; });
if (child.pid) {
  writeFileSync(`.logs/${name}.pid`, String(child.pid) + '\n', { mode: 0o600 });
  child.unref();
  console.log(`${name} launched (pid ${child.pid})`);
}
closeSync(fd);
