#!/usr/bin/env node
/**
 * Make black (or near-black) background transparent in a PNG.
 * Usage: node scripts/make-favicon-transparent.mjs <input.png> <output.png>
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error('Usage: node scripts/make-favicon-transparent.mjs <input.png> <output.png>');
  process.exit(1);
}

const BLACK_THRESHOLD = 25; // pixels with r,g,b all <= this become transparent

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const channels = info.channels;
const len = data.length;
for (let i = 0; i < len; i += channels) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
    data[i + 3] = 0; // alpha = 0
  }
}

await sharp(data, {
  raw: {
    width: info.width,
    height: info.height,
    channels: 4,
  },
})
  .png()
  .toFile(output);

console.log('Done:', output);
