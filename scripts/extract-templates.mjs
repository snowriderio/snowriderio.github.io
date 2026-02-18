#!/usr/bin/env node
/**
 * One-time: extract base layout and home content from index.html.
 * Run from repo root: node scripts/extract-templates.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const lines = html.split('\n');

// Insert SLOT:PAGE_CSS after custom.css (line 75 in 1-based)
const customCssLine = lines.findIndex(l => l.includes('custom.css') && l.includes('stylesheet'));
if (customCssLine === -1) throw new Error('custom.css not found');
lines.splice(customCssLine + 1, 0, '\t<!-- SLOT:PAGE_CSS -->');

// Find main content: <div id="game-page" class="main-wrapper"> ... matching </div> before <footer
const startMarker = '<div id="game-page" class="main-wrapper">';
const footerMarker = '<footer class="footer"';
let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('id="game-page"') && lines[i].includes('main-wrapper')) {
    startIdx = i;
    break;
  }
}
if (startIdx === -1) throw new Error('game-page main wrapper not found');
let endIdx = -1;
let depth = 0;
for (let i = startIdx; i < lines.length; i++) {
  const line = lines[i];
  if (line.match(/<div[\s>]/)) depth++;
  if (line.match(/<\/div>/)) {
    depth--;
    if (depth === 0) {
      endIdx = i;
      break;
    }
  }
  if (line.includes(footerMarker)) break;
}
if (endIdx === -1) throw new Error('matching closing div not found');

const mainContent = lines.slice(startIdx, endIdx + 1).join('\n');
const beforeContent = lines.slice(0, startIdx).join('\n');
const afterContent = lines.slice(endIdx + 1).join('\n');

const baseHtml = beforeContent + '\n\t<!-- SLOT:CONTENT -->\n' + afterContent;

const layoutsDir = path.join(root, 'templates', 'layouts');
const pagesDir = path.join(root, 'templates', 'pages');
fs.mkdirSync(layoutsDir, { recursive: true });
fs.mkdirSync(pagesDir, { recursive: true });

fs.writeFileSync(path.join(layoutsDir, 'base.html'), baseHtml, 'utf8');
fs.writeFileSync(path.join(pagesDir, 'home.html'), mainContent, 'utf8');

function extractMainContent(html, footerMarker = '<footer class="footer"') {
  const lines = html.split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('id="game-page"') && lines[i].includes('main-wrapper')) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;
  let depth = 0;
  let endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const opens = (line.match(/<div[\s>]/g) || []).length;
    const closes = (line.match(/<\/div>/g) || []).length;
    depth += opens - closes;
    if (depth === 0) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return null;
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

// Extract game, category, static from existing pages
const gameHtml = fs.readFileSync(path.join(root, 'games', 'slope', 'index.html'), 'utf8');
const categoryHtml = fs.readFileSync(path.join(root, 'category', 'puzzle-games', 'index.html'), 'utf8');
const aboutHtml = fs.readFileSync(path.join(root, 'about-us', 'index.html'), 'utf8');

const gameContent = extractMainContent(gameHtml);
const categoryContent = extractMainContent(categoryHtml);
const staticContent = extractMainContent(aboutHtml);

if (gameContent) fs.writeFileSync(path.join(pagesDir, 'game.html'), gameContent, 'utf8');
if (categoryContent) fs.writeFileSync(path.join(pagesDir, 'category.html'), categoryContent, 'utf8');
if (staticContent) fs.writeFileSync(path.join(pagesDir, 'static.html'), staticContent, 'utf8');

console.log('Created templates/layouts/base.html and templates/pages/home.html');
console.log('Created templates/pages/game.html, category.html, static.html');
console.log('Home content length:', mainContent.length);
