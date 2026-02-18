#!/usr/bin/env node
/**
 * Local server: serve dist folder; ensure /sports.games/ and all *.games/ return index.html.
 * Run: node scripts/serve.mjs  or  npm run serve
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
// Default build writes to repo root (GitHub Pages); if index.html exists at root, serve from root, else from dist/
const distDir = fs.existsSync(path.join(root, 'index.html')) ? root : path.join(root, 'dist');
const PORT = Number(process.env.PORT) || 5501;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function getPath(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/\?.*$/, '').trim();
  const segs = decoded === '/' || decoded === '' ? [] : decoded.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const clean = segs.join(path.sep) || '';
  const filePath = clean ? path.join(distDir, clean) : path.join(distDir, 'index.html');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(distDir))) return null;
  if (fs.existsSync(filePath)) {
    if (fs.statSync(filePath).isDirectory()) {
      const index = path.join(filePath, 'index.html');
      return fs.existsSync(index) ? index : null;
    }
    return filePath;
  }
  const withIndex = path.join(filePath, 'index.html');
  return fs.existsSync(withIndex) ? withIndex : null;
}

const server = http.createServer((req, res) => {
  const filePath = getPath(req.url);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error');
      return;
    }
    const ext = path.extname(filePath);
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}/`);
  console.log(`Category: http://localhost:${PORT}/sports.games/  http://localhost:${PORT}/snow-rider.games/  ...`);
});
