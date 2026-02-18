#!/usr/bin/env node
/**
 * Generate favicon and apple-touch-icon from a source PNG (e.g. 1024x1024).
 * Usage: node scripts/generate-favicons.mjs [source.png]
 * Default source: favicon-source.png in project root.
 * Outputs: favicon.ico (for sitemap/robots etc.), favicon-96x96, apple-touch-icon, web-app-manifest icons.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultSource = path.join(root, 'favicon-source.png');
const fallbackSource = path.join(root, 'snow-rider-3d.png');
const source = process.argv[2] || (fs.existsSync(defaultSource) ? defaultSource : fallbackSource);

if (!fs.existsSync(source)) {
  console.error('Source image not found. Use favicon-source.png or snow-rider-3d.png in project root, or pass a path.');
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

// favicon.ico so non-HTML URLs (sitemap.xml, robots.txt) show the same icon
const icoSizes = [16, 32];
const icoBuffers = await Promise.all(
  icoSizes.map((size) =>
    sharp(source).resize(size, size).png().toBuffer()
  )
);
const icoBuf = await toIco(icoBuffers);
fs.writeFileSync(path.join(root, 'favicon.ico'), icoBuf);
console.log('Written: favicon.ico');

console.log('Done. Run npm run build to copy to dist/.');
