#!/usr/bin/env node
/**
 * Generate favicon and apple-touch-icon from a source PNG (e.g. 1024x1024).
 * Usage: node scripts/generate-favicons.mjs [source.png]
 * Default source: favicon-source.png in project root.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = process.argv[2] || path.join(root, 'favicon-source.png');

if (!fs.existsSync(source)) {
  console.error('Source image not found:', source);
  process.exit(1);
}

const sizes = [
  { file: 'favicon-96x96.png', size: 96 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'web-app-manifest-192x192.png', size: 192 },
  { file: 'web-app-manifest-512x512.png', size: 512 },
];

for (const { file, size } of sizes) {
  const dest = path.join(root, file);
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(dest);
  console.log('Written:', file);
}

console.log('Done. Run npm run build to copy to dist/.');
