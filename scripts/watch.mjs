#!/usr/bin/env node
/**
 * Watch: monitor source changes and run build automatically.
 * Run: node scripts/watch.mjs  or  npm run watch
 * Keep one terminal running watch; edit code and build runs, then refresh browser.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const WATCH_DIRS = [
  'templates',
  'data',
  'content',
  'themes',
];
const WATCH_FILES = ['scripts/build.mjs'];

const DEBOUNCE_MS = 600;

let timeout = null;

function runBuild() {
  console.log('[watch] Building...');
  const child = spawn('node', ['scripts/build.mjs'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  child.on('close', (code) => {
    if (code === 0) console.log('[watch] Build done. Refresh browser.\n');
    else console.log('[watch] Build failed (code ' + code + ').\n');
  });
}

function scheduleBuild() {
  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => {
    timeout = null;
    runBuild();
  }, DEBOUNCE_MS);
}

function watchDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    fs.watch(dirPath, { recursive: true }, (_, filename) => {
      if (filename && !path.basename(filename).startsWith('.')) {
        console.log('[watch] Change:', path.relative(root, path.join(dirPath, filename)));
        scheduleBuild();
      }
    });
    console.log('  Watching:', path.relative(root, dirPath));
  } catch (err) {
    console.warn('  Cannot watch', dirPath, err.message);
  }
}

function watchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    fs.watch(filePath, () => {
      console.log('[watch] Change:', path.relative(root, filePath));
      scheduleBuild();
    });
    console.log('  Watching:', path.relative(root, filePath));
  } catch (err) {
    console.warn('  Cannot watch', filePath, err.message);
  }
}

console.log('Watch mode: edit templates/, data/, content/, themes/ or scripts/build.mjs to trigger build.\n');
WATCH_DIRS.forEach((d) => watchDir(path.join(root, d)));
WATCH_FILES.forEach((f) => watchFile(path.join(root, f)));
console.log('\nWaiting for changes... (Ctrl+C to exit)\n');
