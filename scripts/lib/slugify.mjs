/**
 * Slug utilities: normalize, dedupe, and avoid reserved routes.
 * Used by build to ensure all game/category/static slugs are valid and unique.
 */

/**
 * Slugify a string: lowercase, no diacritics, only [a-z0-9-], collapse dashes, trim.
 * @param {string} input - Raw string (e.g. name or title)
 * @param {number} maxLen - Max length (default 80); cut at last safe dash or at maxLen
 * @returns {string} Slug; if empty after normalize, returns 'item'
 */
export function slugify(input, maxLen = 80) {
  if (input == null || typeof input !== 'string') return 'item';
  let s = input.trim();
  if (!s) return 'item';

  // NFKD normalize and remove combining marks (diacritics)
  s = s.normalize('NFKD').replace(/\p{Diacritic}/gu, '');

  // đ/Đ -> d (Vietnamese)
  s = s.replace(/đ/g, 'd').replace(/Đ/g, 'd');

  // & -> ' and '
  s = s.replace(/&/g, ' and ');

  // Non [a-z0-9] -> '-'
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Collapse multiple '-' and trim '-'
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (!s) return 'item';

  // Limit length: cut at last '-' before maxLen, or at maxLen
  if (s.length > maxLen) {
    const cut = s.slice(0, maxLen);
    const lastDash = cut.lastIndexOf('-');
    s = lastDash > 0 ? cut.slice(0, lastDash) : cut;
  }
  s = s.replace(/-+$/, '');
  return s || 'item';
}

/**
 * Ensure slug is unique; if already in used set, try slug-2, slug-3, ...
 * Mutates used set by adding the returned slug.
 * @param {string} slug - Base slug
 * @param {Set<string>} used - Set of already-used slugs
 * @returns {string} Unique slug (added to used)
 */
export function dedupeSlug(slug, used) {
  if (!slug) slug = 'item';
  let candidate = slug;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${slug}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * If slug is reserved, append suffix and return; otherwise return slug unchanged.
 * @param {string} slug - Slug to check
 * @param {Set<string>} reserved - Reserved slugs (lowercase)
 * @param {string} suffix - Suffix when reserved (e.g. '-game', '-cat')
 * @returns {string} Non-reserved slug
 */
export function ensureNotReserved(slug, reserved, suffix = '-game') {
  if (!slug) return 'item' + suffix;
  const lower = slug.toLowerCase();
  if (reserved.has(lower)) return slug + suffix;
  return slug;
}

/**
 * Full pipeline: slugify -> ensureNotReserved -> dedupeSlug.
 * Mutates used set.
 * @param {string} input - Raw string (name/title)
 * @param {Set<string>} used - Set of already-used slugs (mutated)
 * @param {Set<string>} reserved - Reserved slugs
 * @param {string} suffix - Suffix when reserved (default '-game')
 * @param {number} maxLen - Max length for slugify (default 80)
 * @returns {string} Normalized, non-reserved, unique slug
 */
export function normalizeAndValidateSlug(input, used, reserved, suffix = '-game', maxLen = 80) {
  const s = slugify(input, maxLen);
  const notReserved = ensureNotReserved(s, reserved, suffix);
  return dedupeSlug(notReserved, used);
}

/**
 * Reserved slugs: routes and asset folders that must not be used as game/category slug.
 * Static pages (about-us, etc.) are reserved so a game/category doesn't take that path.
 */
export const RESERVED_SLUGS = new Set([
  'search', 'post', 'tag', 'games',
  'about-us', 'contact-us', 'dmca', 'privacy-policy', 'terms-of-service',
  '404', 'sitemap', 'sitemap.xml', 'robots', 'robots.txt',
  'favicon', 'favicon.ico',
  'themes', 'data', 'upload', 'play',
].map((s) => s.toLowerCase()));

/**
 * Check if a slug is "dirty" (contains invalid characters for URL segment).
 * @param {string} slug - Candidate slug
 * @returns {boolean} True if slug is not strictly [a-z0-9-]
 */
export function isSlugDirty(slug) {
  if (!slug || typeof slug !== 'string') return true;
  return !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim());
}
