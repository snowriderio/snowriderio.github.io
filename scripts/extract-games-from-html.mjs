#!/usr/bin/env node
/**
 * Extract game list from built game HTML files at repo root.
 * Outputs content/games.json so build and site stay in sync.
 * Run: node scripts/extract-games-from-html.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const exclude = new Set(['index.html', '404.html']);

const nameToSlug = {
  'Hot Games': 'hot',
  'Trending Games': 'trending',
  'Snow Rider Games': 'snow-rider',
  'Clicker': 'clicker',
  'Io': 'io',
  'Adventure': 'adventure',
  '2 player': '2-player',
  'Shooting': 'shooting',
  'Sports': 'sports',
  'Car': 'car',
  'Puzzle': 'puzzle',
  'Casual': 'casual',
  'Kids': 'kids',
  'Runner': 'casual',
  'Popular Games': 'hot',
  'New Games': 'hot',
  'Other': 'casual',
};

function slugForCategory(name) {
  const n = (name || '').trim();
  return nameToSlug[n] || n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function extractGameFromHtml(html, slugFromFile) {
  const nameMatch = html.match(/<meta name="description" content="([^"]+)"/);
  let desc = nameMatch ? nameMatch[1].replace(/\.\.\.?\s*Discover more at.*$/i, '').trim() : '';
  const ogImageMatch = html.match(/<meta property="og:image" content="https?:\/\/[^/]+\/([^"]+)"/);
  const imagePath = ogImageMatch ? '/' + ogImageMatch[1] : '/upload/placeholder.png';
  const image = imagePath.startsWith('http') ? '/upload/placeholder.png' : imagePath;

  let name = '';
  let dateModified = '';
  let genre = [];
  let ratingValue = 4.5;
  let ratingCount = 100;

  const ldStart = html.indexOf('<script type="application/ld+json">');
  if (ldStart !== -1) {
    const start = html.indexOf('>', ldStart) + 1;
    const end = html.indexOf('</script>', start);
    const raw = html.slice(start, end).trim();
    try {
      const json = JSON.parse(raw);
      const graph = Array.isArray(json['@graph']) ? json['@graph'] : [json];
      for (const node of graph) {
        if (node['@type'] === 'VideoGame') {
          name = node.name || name;
          if (node.description) desc = node.description;
          dateModified = node.dateModified || '';
          genre = node.genre || [];
          if (node.aggregateRating) {
            ratingValue = Number(node.aggregateRating.ratingValue) || 4.5;
            ratingCount = Number(node.aggregateRating.ratingCount) || 100;
          }
          break;
        }
      }
    } catch (_) {}
  }
  if (!name) {
    const titleMatch = html.match(/<title>([^–|]+)[–|]/);
    name = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : slugFromFile;
  }

  const categories = genre.map((g) => {
    const n = typeof g === 'string' ? g : (g && g.name) || 'Other';
    const slug = slugForCategory(n);
    return { name: n, slug };
  });
  if (categories.length === 0) categories.push({ name: 'Casual', slug: 'casual' });
  const categoryMain = categories[0];

  return {
    name,
    slug: slugFromFile,
    image,
    description: desc || `Play ${name} online for free.`,
    categories,
    categoryMain,
    ratingValue,
    ratingCount,
    playsPerMonth: Math.floor(ratingCount * 50),
    updatedAt: dateModified || '2026-01-01',
    iframeUrl: slugFromFile === 'snow-rider-3d' ? '/play/' : '',
  };
}

const files = fs.readdirSync(root, { withFileTypes: true });
const gameFiles = files
  .filter((e) => e.isFile() && e.name.endsWith('.html') && !exclude.has(e.name))
  .map((e) => e.name)
  .sort();

const games = [];
for (const file of gameFiles) {
  const slug = file.replace(/\.html$/, '');
  const filePath = path.join(root, file);
  const html = fs.readFileSync(filePath, 'utf8');
  const game = extractGameFromHtml(html, slug);
  games.push(game);
}

games.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

const outPath = path.join(root, 'content', 'games.json');
fs.writeFileSync(outPath, JSON.stringify(games, null, 2), 'utf8');
console.log(`Wrote ${games.length} game(s) to ${outPath}`);
console.log('Game slugs:', games.map((g) => g.slug).join(', '));
