import { spawn } from 'node:child_process';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.local.config.ts', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
try {
 await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Preview did not start')), 15000);
  server.stdout.on('data', chunk => { if (String(chunk).includes('http://127.0.0.1:4173')) { clearTimeout(timeout); resolve(); } });
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  server.once('error', reject);
  server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Preview exited: ${code}`)); });
 });
 for (const file of ['tests/quiz-dates-ui.mjs', 'tests/reading-ui.mjs', 'tests/reading-lookup-ui.mjs', 'tests/audio-ui.mjs']) {
  await new Promise((resolve, reject) => {
   const child = spawn(process.execPath, [file], { stdio: 'inherit' });
   child.once('error', reject);
   child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} failed: ${code}`)));
  });
 }
} finally { server.kill('SIGTERM'); }
