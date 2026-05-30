/**
 * watch-and-run.js — Zero-dependency dev supervisor for serve-dashboard.js
 * Spawns the dashboard server as a child process and restarts it when
 * watched files change.
 *
 * Usage:
 *   node scripts/dashboards/watch-and-run.js        # watches default files
 *   node scripts/dashboards/watch-and-run.js 3738   # custom port
 *
 * Design: Supervisor pattern — parent watches files, kills/restarts child.
 * Works on Windows (fs.watchFile polling) and Linux without any npm packages.
 */

'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PORT      = process.argv[2] || '3737';
const PROJ_ROOT = path.resolve(__dirname, '..', '..');

const WATCH_FILES = [
  path.join(PROJ_ROOT, 'scripts', 'dashboards', 'serve-dashboard.js'),
  path.join(PROJ_ROOT, 'scripts', 'dashboards', 'mission-control.html'),
];

let child  = null;
let restarting = false;

function startChild() {
  if (restarting) return;
  console.log(`[watcher] Starting server on port ${PORT}...`);
  child = spawn(process.execPath, [
    path.join(PROJ_ROOT, 'scripts', 'dashboards', 'serve-dashboard.js'),
    PORT,
  ], {
    cwd:   PROJ_ROOT,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || restarting) return; // intentional kill
    console.log(`[watcher] Server exited (code=${code}). Restarting in 3s...`);
    setTimeout(() => { restarting = false; startChild(); }, 3000);
  });
}

function scheduleRestart(changedFile) {
  if (restarting) return;
  restarting = true;
  console.log(`[watcher] Change detected: ${path.basename(changedFile)}`);
  console.log('[watcher] Restarting server in 500ms...');
  setTimeout(() => {
    if (child) {
      child.kill('SIGTERM');
      child = null;
    }
    restarting = false;
    startChild();
  }, 500);
}

// Watch files with polling (Windows-compatible)
WATCH_FILES.forEach(f => {
  if (!fs.existsSync(f)) return;
  fs.watchFile(f, { interval: 1500 }, () => scheduleRestart(f));
  console.log(`[watcher] Watching: ${path.relative(PROJ_ROOT, f)}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[watcher] Shutting down...');
  if (child) child.kill('SIGTERM');
  process.exit(0);
});

startChild();
