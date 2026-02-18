/**
 * Build audit: data, HTML, links, image alt, sitemap.
 * Run after dist is generated. On failure: log [FAIL] and exit 1.
 */
import fs from 'fs';
import path from 'path';

const FAILS = [];
const WARNS = [];

function fail(msg) {
  FAILS.push(msg);
}
function warn(msg) {
  WARNS.push(msg);
}

/**
 * Data audit: run after games loaded and slug normalized.
 * reserved: Set of reserved slugs (lowercase).
 */
export function auditData(games, opts = {}) {
  const { reserved = new Set(), root = '' } = opts;
  FAILS.length = 0;
  WARNS.length = 0;

  if (!Array.isArray(games)) {
    fail('[FAIL] games is not an array');
    return { fails: [...FAILS], warns: [...WARNS] };
  }

  const slugsSeen = new Set();
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const name = g.name != null ? String(g.name).trim() : '';
    if (!name) {
      fail(`[FAIL] Game at index ${i} has no name`);
    }
    const slug = g.slug != null ? String(g.slug).trim() : '';
    if (!slug) {
      fail(`[FAIL] Game "${name || 'index ' + i}" has empty slug after normalize`);
    }
    if (slug && reserved.has(slug.toLowerCase())) {
      fail(`[FAIL] Game "${name}" slug "${slug}" is reserved`);
    }
    if (slug && slugsSeen.has(slug)) {
      fail(`[FAIL] Duplicate slug "${slug}" (game: ${name})`);
    }
    if (slug) slugsSeen.add(slug);

    if (!Array.isArray(g.categories) || g.categories.length === 0) {
      fail(`[FAIL] Game "${name}" has no categories (must have at least one)`);
    }
    if (!g.description || !String(g.description).trim()) {
      warn(`[WARN] Game "${name}" has no description (fallback used)`);
    }
    if (g.image && root) {
      const imgPath = g.image.startsWith('/') ? g.image.slice(1) : g.image;
      const full = path.join(root, imgPath);
      if (!imgPath.startsWith('http') && !fs.existsSync(full)) {
        warn(`[WARN] Game "${name}" image file not found: ${imgPath}`);
      }
    }
  }

  return { fails: [...FAILS], warns: [...WARNS] };
}

/** When building to repo root, skip auditing source dirs (templates, content, etc.). */
const SKIP_AUDIT_DIRS = new Set(['templates', 'content', 'scripts', 'docs', '.cursor', '.git', 'node_modules']);

/**
 * HTML audit: canonical, title, meta description, schema.
 * distDir, gameSlugs Set, categoryPaths Set (e.g. "arcade.games"). skipDirs: when distDir is repo root.
 */
export function auditHtmlFiles(distDir, opts = {}) {
  const { gameSlugs = new Set(), categoryPaths = new Set(), skipDirs = new Set() } = opts;
  FAILS.length = 0;
  WARNS.length = 0;

  function walk(dir, base = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (base === '' && skipDirs.has(e.name)) continue;
        walk(full, rel);
      } else if (e.name.endsWith('.html')) {
        const html = fs.readFileSync(full, 'utf8');
        const relPath = path.relative(distDir, full).replace(/\\/g, '/');
        const is404 = relPath === '404.html' || relPath === '404/index.html' || relPath.startsWith('404/');
        const isPlay = relPath.startsWith('play/');
        const isSearch = relPath === 'search/index.html' || relPath.endsWith('/search/index.html');
        const isGamePage = base && gameSlugs.has(base) && e.name === `${base}.html`;
        const isCategoryPage = base && base.endsWith('.games') && categoryPaths.has(base) && e.name === 'index.html';

        if (!is404 && !isPlay) {
          if (!/<link\s+rel="canonical"\s+href=/.test(html)) {
            fail(`[FAIL] ${relPath} missing canonical`);
          }
          if (!/<title>[^<]+<\/title>/.test(html)) {
            fail(`[FAIL] ${relPath} missing title`);
          }
        }
        if (isGamePage || isCategoryPage) {
          if (!/<meta\s+name="description"\s+content=/.test(html)) {
            fail(`[FAIL] ${relPath} missing meta description`);
          }
        }
        if (isGamePage) {
          if (!/"@type"\s*:\s*"VideoGame"/.test(html)) {
            fail(`[FAIL] ${relPath} missing VideoGame schema`);
          }
          if (!/"@type"\s*:\s*"BreadcrumbList"/.test(html)) {
            fail(`[FAIL] ${relPath} missing BreadcrumbList schema`);
          }
        }
        if (isCategoryPage) {
          if (!/"@type"\s*:\s*"BreadcrumbList"/.test(html)) {
            fail(`[FAIL] ${relPath} missing BreadcrumbList schema`);
          }
        }
      }
    }
  }

  walk(distDir);
  return { fails: [...FAILS], warns: [...WARNS] };
}

/**
 * Link audit: no /tag/, /games/, /category/; game/category links must have trailing slash.
 */
export function auditLinks(html, filePath, opts = {}) {
  const { gameSlugs = new Set(), categoryPaths = new Set() } = opts;
  const fails = [];
  const hrefRe = /href="(\/[^"]*)"/g;
  const allowedPrefixes = ['/404.html', '/sitemap.xml', '/robots.txt', '/themes/', '/data/', '/upload/', '/play/'];
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    if (href.includes('/tag/')) {
      fails.push(`[FAIL] ${filePath} has href="/tag/..." (forbidden)`);
    }
    if (href.includes('/games/')) {
      fails.push(`[FAIL] ${filePath} has href="/games/..." (forbidden)`);
    }
    if (href.includes('/category/')) {
      fails.push(`[FAIL] ${filePath} has href="/category/..." (forbidden)`);
    }
    const isAllowed = allowedPrefixes.some((p) => href === p || href.startsWith(p));
    if (isAllowed) continue;
    if (href.startsWith('/') && !href.endsWith('/') && href.length > 1) {
      const pathPart = href.slice(1).split('?')[0].split('#')[0];
      if (gameSlugs.has(pathPart)) {
        // Game links: now expect NO trailing slash (pathPart is the slug)
        // href="/slug" is fine. href="/slug/" would be "slug/" in pathPart? No, pathPart strips /.
        if (href.endsWith('/')) {
          fails.push(`[FAIL] ${filePath} game link has trailing slash: href="${href}" (should be /${pathPart})`);
        }
      }
      if (categoryPaths.has(pathPart)) {
        fails.push(`[FAIL] ${filePath} category link missing trailing slash: href="${href}"`);
      }
    }
  }
  return fails;
}

/**
 * Image alt audit: every img must have non-empty alt, except whitelist (class contains icon/logo/loading).
 */
export function auditImagesAlt(html, filePath) {
  const fails = [];
  const imgRe = /<img\s[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null) {
    const tag = m[0];
    const hasAlt = /alt\s*=\s*["']([^"']*)["']/.exec(tag);
    const altValue = hasAlt ? hasAlt[1].trim() : '';
    const hasClass = /class\s*=\s*["']([^"']*)["']/.exec(tag);
    const cls = hasClass ? hasClass[1].toLowerCase() : '';
    const whitelist = cls.includes('icon') || cls.includes('logo') || cls.includes('loading');
    if (!whitelist && !altValue) {
      fails.push(`[FAIL] ${filePath} img missing alt: ${tag.slice(0, 60)}...`);
    }
  }
  return fails;
}

/**
 * Sitemap audit: no tag/games/404; must have home; must have game URLs if games exist.
 */
export function auditSitemap(xml, gamesCount) {
  const fails = [];
  if (xml.includes('/tag/')) fails.push('[FAIL] sitemap.xml contains /tag/');
  if (xml.includes('/games/')) fails.push('[FAIL] sitemap.xml contains /games/');
  if (xml.includes('/404.html') || xml.includes('404.html')) fails.push('[FAIL] sitemap.xml contains 404.html');
  if (!/<loc>[^<]*\/<\/loc>/.test(xml) && !/<loc>[^<]*https?:[^<]*\/<\/loc>/.test(xml)) {
    fails.push('[FAIL] sitemap.xml missing home URL (/)');
  }
  if (gamesCount > 0) {
    const gameUrlCount = (xml.match(/<loc>[^<]*\/[a-z0-9-]+\/<\/loc>/g) || []).length;
    if (gameUrlCount === 0) {
      fails.push('[FAIL] sitemap.xml has no game URLs but games.json has entries');
    }
  }
  return fails;
}

/**
 * Run all audits. Returns { fails, warns }. If fails.length > 0, caller should exit(1).
 */
export function runAudit(distDir, games, root, categoriesMap) {
  const allFails = [];
  const allWarns = [];

  const reserved = new Set([
    'search', 'post', 'tag', 'games', 'about-us', 'contact-us', 'dmca', 'privacy-policy', 'terms-of-service',
    '404', 'sitemap', 'sitemap.xml', 'robots', 'robots.txt', 'favicon', 'favicon.ico', 'themes', 'data', 'upload', 'play',
  ].map((s) => s.toLowerCase()));

  const { fails: dataFails, warns: dataWarns } = auditData(games, { reserved, root });
  allFails.push(...dataFails);
  allWarns.push(...dataWarns);

  const gameSlugs = new Set((games || []).map((g) => g.slug).filter(Boolean));
  const categoryPaths = new Set();
  if (categoriesMap && typeof categoriesMap.keys === 'function') {
    for (const slug of categoriesMap.keys()) {
      categoryPaths.add(`${slug}.games`);
    }
  }

  const skipDirs = distDir === root ? SKIP_AUDIT_DIRS : new Set();
  const { fails: htmlFails } = auditHtmlFiles(distDir, { gameSlugs, categoryPaths, skipDirs });
  allFails.push(...htmlFails);

  function walkHtml(dir, base = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (base === '' && skipDirs.has(e.name)) continue;
        walkHtml(full, rel);
      } else if (e.name.endsWith('.html')) {
        const html = fs.readFileSync(full, 'utf8');
        const relPath = path.relative(distDir, full).replace(/\\/g, '/');
        const linkFails = auditLinks(html, relPath, { gameSlugs, categoryPaths });
        allFails.push(...linkFails);
        const altFails = auditImagesAlt(html, relPath);
        allFails.push(...altFails);
      }
    }
  }
  walkHtml(distDir);

  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    const sitemapFails = auditSitemap(sitemapXml, (games || []).length);
    allFails.push(...sitemapFails);
  }

  return { fails: allFails, warns: allWarns };
}
