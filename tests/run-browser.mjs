import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
if (process.env.LEXIDAY_TEST_OUTPUT) mkdirSync(process.env.LEXIDAY_TEST_OUTPUT, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.local.config.ts', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let diagnostics = ''; let failure;
server.stdout.on('data', chunk => { diagnostics += String(chunk); });
server.stderr.on('data', chunk => { diagnostics += String(chunk); });
server.once('error', error => { failure = error; });
server.once('exit', code => { failure = new Error(`Preview exited: ${code}`); });
try {
 const deadline = Date.now() + 15000;
 // Readiness must not depend on terminal colors or stdout chunk boundaries.
 while (true) {
  if (failure) throw failure;
  let ready = false;
  try { ready = (await fetch('http://127.0.0.1:4173', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
  if (ready) break;
  if (Date.now() >= deadline) throw new Error(`Preview did not start: ${diagnostics}`);
  await new Promise(resolve => setTimeout(resolve, 200));
 }
 for (const file of ['tests/photo-import-ui.mjs', 'tests/quiz-dates-ui.mjs', 'tests/reading-ui.mjs', 'tests/reading-lookup-ui.mjs', 'tests/audio-ui.mjs']) {
  console.log(`Checking ${file}`);
  await new Promise((resolve, reject) => {
   const child = spawn(process.execPath, [file], { stdio: 'inherit' });
   child.once('error', reject);
   child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} failed: ${code}`)));
  });
 }
} finally { server.kill('SIGTERM'); }
