#!/usr/bin/env node
/**
 * Build: merge base layout + page content + page CSS, output to dist/.
 * Run from repo root: node scripts/build.mjs  or  npm run build
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  slugify,
  dedupeSlug,
  ensureNotReserved,
  normalizeAndValidateSlug,
  RESERVED_SLUGS,
  isSlugDirty,
} from './lib/slugify.mjs';
import { runAudit } from './lib/audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const templatesDir = path.join(root, 'templates');
const layoutsDir = path.join(templatesDir, 'layouts');
const pagesDir = path.join(templatesDir, 'pages');
const contentDir = path.join(root, 'content');
const contentDirStatic = path.join(contentDir, 'static');

const LIST_LIMIT = 12;
const HOME_NEW_GAMES_LIMIT = 24;
/** Game page (sidebar New games): 3 columns x 10 rows = 30 games, newest first. */
const GAME_PAGE_NEW_GAMES_LIMIT = 30;
const HOME_TRENDING_LIMIT = 20;
const HOME_SNOWRIDER_LIMIT = 9;
/** Game shown in main homepage hero — excluded from Trending / Snow Rider / New games on home. */
const HOME_GAME_SLUG = 'snow-rider-3d';
/** Template: each category page shows at most N games (set null to use pagination). */
const CATEGORY_PREVIEW_GAMES = null;
/** Number of games per category page: 8 columns x 3 rows = 24. More than that goes to page 2, 3... */
const CATEGORY_GAMES_PER_PAGE = 24;

function extractBetween(html, startMark, endMark) {
  const i = html.indexOf(startMark);
  const j = html.indexOf(endMark);
  if (i === -1 || j === -1 || j <= i) return '';
  return html.slice(i + startMark.length, j);
}

function replaceBetween(html, startMark, endMark, newContent) {
  const i = html.indexOf(startMark);
  const j = html.indexOf(endMark);
  if (i === -1 || j === -1) return html;
  const endIndex = j + endMark.length;
  return html.slice(0, i) + newContent + html.slice(endIndex);
}

/** Canonical game URL: /<slug> (no trailing slash). */
function gameUrl(slug) {
  return `/${(slug || '').replace(/^\/|\/$/g, '')}`;
}

/** Canonical category URL: /<slug>.games/ or /<slug>.games/page/N/ */
function categoryUrl(slug, page = 1) {
  const s = (slug || '').replace(/^\/|\/$/g, '');
  if (!s) return '/';
  return page <= 1 ? `/${s}.games/` : `/${s}.games/page/${page}/`;
}

function extractCardTemplate(block) {
  return extractBetween(block, '<!-- CARD:TEMPLATE_START -->', '<!-- CARD:TEMPLATE_END -->').trim();
}

function extractNewGamesCardTemplate(block) {
  return extractBetween(block, '<!-- CARD:NEW_GAMES_TEMPLATE_START -->', '<!-- CARD:NEW_GAMES_TEMPLATE_END -->').trim();
}

function extractHotGamesCardTemplate(block) {
  return extractBetween(block, '<!-- CARD:HOT_GAMES_TEMPLATE_START -->', '<!-- CARD:HOT_GAMES_TEMPLATE_END -->').trim();
}

function extractTrendingCardTemplate(block) {
  return extractBetween(block, '<!-- CARD:TRENDING_TEMPLATE_START -->', '<!-- CARD:TRENDING_TEMPLATE_END -->').trim();
}

function extractSnowriderCardTemplate(block) {
  return extractBetween(block, '<!-- CARD:SNOWRIDER_TEMPLATE_START -->', '<!-- CARD:SNOWRIDER_TEMPLATE_END -->').trim();
}

/** Game published/updated within the last 30 days is considered "New". */
function isWithinLast30Days(updatedAt, refDate = new Date()) {
  if (!updatedAt) return false;
  const d = new Date(String(updatedAt).trim());
  if (Number.isNaN(d.getTime())) return false;
  const diff = refDate.getTime() - d.getTime();
  return diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
}

/** Tag from category only (priority Hot > Trending > New). New = has New category or updated in 30 days. Do not use isHot. */
function getThumbLabel(game, buildRefDate = new Date()) {
  const cats = game.categories || [];
  const hasHot = cats.some((c) => /hot/i.test(String(c.slug ?? c.name ?? '')));
  const hasTrending = cats.some((c) => /trending/i.test(String(c.slug ?? c.name ?? '')));
  const hasNew = cats.some((c) => /^new$/i.test(String(c.slug ?? '')) || /\bnew\s*games?\b/i.test(String(c.name ?? '')));
  const newByDate = isWithinLast30Days(game.updatedAt, buildRefDate);
  if (hasHot) return { class: 'GameThumbLabel_Hot', text: 'Hot' };
  if (hasTrending) return { class: 'GameThumbLabel_Trending', text: 'Trending' };
  if (hasNew || newByDate) return { class: 'GameThumbLabel_New', text: 'New' };
  return { class: 'GameThumbLabel_Hot', text: 'Hot' };
}

function renderCard(template, game, labelOverride = null) {
  const slug = game.slug || '';
  const name = (game.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const image = (game.image || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const href = gameUrl(slug);
  const label = labelOverride || getThumbLabel(game);
  const labelDiv = `<div class="GameThumbLabel ${label.class}">${label.text}</div>`;
  return template
    .replace(/href="[^"]*"/, (m) => (m.startsWith('href="\/') ? `href="${href}"` : m))
    .replace(/href="\/__SLUG__\/"/g, `href="${href}"`)
    .replace(/\bsrc="[^"]*"/, `src="${image}"`)
    .replace(/\balt="[^"]*"/, `alt="${name} game thumbnail"`)
    .replace(/\btitle="[^"]*"/g, `title="${name}"`)
    .replace(/(<span class="text-overflow">)[^<]*(<\/span>)/, `$1${name}$2`)
    .replace(/<div class="GameThumbLabel GameThumbLabel_(Hot|Trending|New)">[^<]*<\/div>/, labelDiv);
}

function buildHomeWithGames(homeHtml, games) {
  let out = homeHtml;

  // New games (right column) — exclude homepage hero game; newest first (by updatedAt desc, then by order in list)
  const newGames = games
    .map((g, i) => ({ ...g, _order: i }))
    .filter((g) => g.slug !== HOME_GAME_SLUG)
    .sort((a, b) => {
      const da = new Date(a.updatedAt || 0);
      const db = new Date(b.updatedAt || 0);
      if (db - da !== 0) return db - da;
      return a._order - b._order; // same date: earlier in list = newer = first
    })
    .slice(0, HOME_NEW_GAMES_LIMIT);
  const newStart = '<!-- HOME:NEW_GAMES_START -->';
  const newEnd = '<!-- HOME:NEW_GAMES_END -->';
  const newBlock = extractBetween(out, newStart, newEnd);
  const newCardTemplate = extractCardTemplate(newBlock);
  if (newCardTemplate) {
    const newCards = newGames.map((g) => renderCard(newCardTemplate, g)).join('\n\t\t\t\t\t');
    out = replaceBetween(out, newStart, newEnd, newCards);
  }

  // Trending games rail (below play area) — exclude homepage hero game
  const hasTrending = (g) => (g.categories || []).some(
    (c) => (String(c.slug || '').toLowerCase().includes('trending')) || (String(c.name || '').toLowerCase().includes('trending'))
  );
  const trendingGames = [...games]
    .filter((g) => g.slug !== HOME_GAME_SLUG && hasTrending(g))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, HOME_TRENDING_LIMIT);
  const trendStart = '<!-- HOME:TRENDING_START -->';
  const trendEnd = '<!-- HOME:TRENDING_END -->';
  const trendBlock = extractBetween(out, trendStart, trendEnd);
  const trendCardTemplate = extractTrendingCardTemplate(trendBlock);
  if (trendCardTemplate) {
    const trendingLabel = { class: 'GameThumbLabel_Trending', text: 'Trending' };
    const trendCards = trendingGames.map((g) => renderCard(trendCardTemplate, g, trendingLabel)).join('\n\t\t\t\t\t\t');
    out = replaceBetween(out, trendStart, trendEnd, trendCards);
    const trendingRows = trendingGames.length >= 10 ? '2' : '1';
    out = out.replace('data-rows="__TRENDING_ROWS__"', `data-rows="${trendingRows}"`);
  }

  // Snow Rider Games: only games with category snow-rider, newest first — exclude homepage hero game
  const hasSnowRider = (g) => (g.categories || []).some(
    (c) => /snow-rider|snow\s*rider/i.test(String(c.slug ?? c.name ?? ''))
  );
  const snowriderGames = [...games]
    .filter((g) => g.slug !== HOME_GAME_SLUG && hasSnowRider(g))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, HOME_SNOWRIDER_LIMIT);
  const snowStart = '<!-- HOME:SNOWRIDER_START -->';
  const snowEnd = '<!-- HOME:SNOWRIDER_END -->';
  const snowBlock = extractBetween(out, snowStart, snowEnd);
  const snowCardTemplate = extractSnowriderCardTemplate(snowBlock);
  if (snowCardTemplate) {
    const snowCards = snowriderGames.map((g) => renderCard(snowCardTemplate, g)).join('\n\t\t\t\t\t\t');
    out = replaceBetween(out, snowStart, snowEnd, snowCards);
  }

  // Homepage breadcrumb: Home » Home (homepage)
  const homeBreadcrumbHtml = `<a class="bread-crumb-item" href="/"><svg fill="#fff" height="20" viewbox="0 0 64 64" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M 32 3 L 1 28 L 1.4921875 28.654297 C 2.8591875 30.477297 5.4694688 30.791703 7.2304688 29.345703 L 32 9 L 56.769531 29.345703 C 58.530531 30.791703 61.140812 30.477297 62.507812 28.654297 L 63 28 L 54 20.742188 L 54 8 L 45 8 L 45 13.484375 L 32 3 z M 32 13 L 8 32 L 8 56 L 56 56 L 56 35 L 32 13 z M 26 34 L 38 34 L 38 52 L 26 52 L 26 34 z"></path></svg></a><span class="bread-crumb-sep">»</span><span class="bread-crumb-item bread-crumb-current">Home</span>`;
  out = out.replace('<!-- HOME:BREADCRUMB -->', homeBreadcrumbHtml);

  // Homepage categories: only 3 categories Hot Games, Snow Rider Games, Sports (URL /hot.games, /snow-rider.games, /sports.games)
  const homeCateHtml = `<a class="us-sticker game-cate-link" href="/hot.games/">Hot Games</a><a class="us-sticker game-cate-link" href="/snow-rider.games/">Snow Rider Games</a><a class="us-sticker game-cate-link" href="/sports.games/">Sports</a>`;
  out = out.replace('<!-- HOME:CATE -->', homeCateHtml);

  return out;
}

const RELATED_LIMIT = 7;
const SITE_URL = 'https://snowrider-3d.org';
const SITE_NAME = 'Snow Rider 3D';

/** GitHub Pages: build output at repo root so Pages serves from /. */
const PUBLISH_ROOT = process.env.PUBLISH_ROOT !== '0';
const distDir = PUBLISH_ROOT ? root : path.join(root, 'dist');

/**
 * Base URL for sitemap/robots/canonical/schema. Always non-www: https://snowrider-3d.org
 * If CNAME exists at repo root => https://<domain> (www stripped). Else SITE_URL.
 */
function getBaseUrl() {
  const cnamePath = path.join(root, 'CNAME');
  if (fs.existsSync(cnamePath)) {
    let domain = fs.readFileSync(cnamePath, 'utf8').trim().replace(/^https?:\/\//, '').split('/')[0];
    if (domain) {
      if (domain.toLowerCase().startsWith('www.')) domain = domain.slice(4);
      return `https://${domain}`;
    }
  }
  return SITE_URL;
}

/**
 * Replace title, meta description, canonical, and optional OG/Twitter.
 * Avoids duplicates by replacing existing tags. baseUrl used for absolute URLs.
 * opts.ogTitle: if set, used for og:title and twitter:title (else use title).
 * opts.ogDesc: if set, used for og:description and twitter:description (else use desc).
 */
function injectMetaAndOG(html, opts) {
  const { title, desc, ogTitle, ogDesc, canonical, image, url, baseUrl } = opts;
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : '';
  const canonicalFull = canonical.startsWith('http') ? canonical : base ? base + (canonical.startsWith('/') ? canonical : '/' + canonical) : (canonical.startsWith('/') ? canonical : '/' + canonical);
  const pageUrl = url ? (url.startsWith('http') ? url : base ? base + (url.startsWith('/') ? url : '/' + url) : url) : canonicalFull;
  const imageFull = image ? (image.startsWith('http') ? image : base ? base + (image.startsWith('/') ? image : '/' + image) : image) : '';
  const titleForOg = (ogTitle != null && ogTitle !== '') ? ogTitle : title;
  const descForOg = (ogDesc != null && ogDesc !== '') ? ogDesc : desc;

  let out = html;
  if (title != null) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    out = out.replace(/<meta name="title" content="[^"]*">/, `<meta name="title" content="${escapeHtml(title)}">`);
  }
  if (desc != null) {
    out = out.replace(/<meta name="description"[\s\S]*?content="[^"]*">/, `<meta name="description" content="${escapeHtml(desc)}">`);
  }
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonicalFull)}">`;
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link rel="canonical" href="[^"]*">/, canonicalTag);
  } else {
    out = out.replace('</head>', `\t${canonicalTag}\n</head>`);
  }
  if (titleForOg != null) {
    out = out.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(titleForOg)}">`);
    out = out.replace(/<meta property="twitter:title" content="[^"]*">/, `<meta property="twitter:title" content="${escapeHtml(titleForOg)}">`);
  }
  if (descForOg != null) {
    out = out.replace(/<meta property="og:description"[\s\S]*?content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(descForOg)}">`);
    out = out.replace(/<meta property="twitter:description"[\s\S]*?content="[^"]*">/, `<meta property="twitter:description" content="${escapeHtml(descForOg)}">`);
  }
  out = out.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(pageUrl)}">`);
  out = out.replace(/<meta property="twitter:url" content="[^"]*">/, `<meta property="twitter:url" content="${escapeHtml(pageUrl)}">`);
  if (imageFull) {
    out = out.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escapeHtml(imageFull)}">`);
    out = out.replace(/<meta property="twitter:image" content="[^"]*">/, `<meta property="twitter:image" content="${escapeHtml(imageFull)}">`);
  }
  out = out.replace(/<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="website">');
  if (!out.includes('twitter:card')) {
    out = out.replace('</head>', '\t<meta property="twitter:card" content="summary_large_image">\n</head>');
  } else {
    out = out.replace(/<meta property="twitter:card" content="[^"]*">/, '<meta property="twitter:card" content="summary_large_image">');
  }
  return out;
}

/**
 * Replace first JSON-LD script block with new schema markup (string of one or more <script>...</script>).
 */
function injectJsonLd(html, schemaMarkup) {
  return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, schemaMarkup.trim());
}

/** Category URL path: /<slug>.games/ — slug must already be normalized. */
function categoryPagePath(slug) {
  return `${slug}.games`;
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateDesc(text, maxLen = 160) {
  if (!text) return '';
  const t = String(text).replace(/\n/g, ' ').trim();
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen - 3);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 120 ? slice.slice(0, lastSpace) : slice;
  return cut + '...';
}

/** Game page title: 50–60 chars, {gameName} + brand, no keyword stuffing, no ALL CAPS. */
function gameMetaTitle(gameName, siteName) {
  const name = String(gameName || '').trim();
  const site = String(siteName || SITE_NAME).trim();
  const candidate = `${name} – Play & Master the Run | ${site}`;
  if (candidate.length <= 60) return candidate;
  const short = `${name} | ${site}`;
  return short.length <= 60 ? short : short.slice(0, 57) + '...';
}

/** Strip "free / online / no download" and generic "Play X for free" from description. */
function sanitizeGameDescription(text) {
  if (!text || typeof text !== 'string') return '';
  let t = text
    .replace(/\b(play\s+[^.]*?\s+)(online\s+)?(for\s+)?free\b/gi, '$1')
    .replace(/\bonline\s+for\s+free\b/gi, '')
    .replace(/\bfor\s+free\b/gi, '')
    .replace(/\bno\s+download\b/gi, '')
    .replace(/\bfree\s+online\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.replace(/^[.\s,;]+|[.\s,;]+$/g, '').trim() || text.trim();
}

/** Short action-oriented fallback when description is missing or generic. */
function gameDescriptionFallback(game) {
  const name = game.name || 'Game';
  const cats = (game.categories || []).map((c) => (c.name || '').toLowerCase());
  if (cats.some((c) => /clicker|idle/i.test(c))) return `Click, upgrade, and grow your empire. ${name} rewards strategy and persistence.`;
  if (cats.some((c) => /puzzle/i.test(c))) return `Slide tiles and solve the puzzle. ${name} challenges your logic and focus.`;
  if (cats.some((c) => /racing|car|sports/i.test(c))) return `Race, stunt, and beat the clock. ${name} puts your reflexes to the test.`;
  if (cats.some((c) => /runner|adventure/i.test(c))) return `Dodge obstacles and run as far as you can. ${name} keeps you on the edge.`;
  return `Master the controls and beat your high score. ${name} brings fast, fun gameplay to your browser.`;
}

/** Game meta description: 120–160 chars, action-oriented, no "free/online/no download". */
function gameMetaDescription(game) {
  let raw = game.description && String(game.description).trim();
  const isGeneric = !raw || /play\s+.*\s+(online\s+)?(for\s+)?free/i.test(raw) || raw.length < 40;
  if (isGeneric) raw = gameDescriptionFallback(game);
  const sanitized = sanitizeGameDescription(raw);
  const desc = truncateDesc(sanitized || raw, 160);
  if (desc.length < 120 && raw.length > 120) return truncateDesc(raw, 160);
  return desc;
}

/** OG/Twitter description: close to meta but not identical (slight variation). */
function gameOgDescription(metaDesc, gameName, siteName) {
  if (!metaDesc || metaDesc.length < 80) return metaDesc;
  const site = siteName || SITE_NAME;
  const tail = ` Discover more at ${site}.`;
  const max = Math.min(160 - tail.length, 140);
  const lead = metaDesc.length <= max ? metaDesc.trim() : metaDesc.slice(0, max - 3).replace(/\s+\S*$/, '') + '...';
  return (lead.endsWith('.') ? lead : lead) + tail;
}

/** Category priority order for breadcrumb/tag when a game has multiple categories (top to bottom). */
const CATEGORY_PRIORITY = [
  'Hot Games',
  'Trending Games',
  'Snow Rider Games',
  'Clicker',
  'Io',
  'Adventure',
  '2 player',
  'Shooting',
  'Sports',
  'Car',
  'Puzzle',
  'Casual',
  'Kids',
];

/** 13 fixed categories: URLs like /sports.games, /hot.games, ... (short slug, no -games). */
const FIXED_CATEGORIES = [
  { name: 'Hot Games', slug: 'hot' },
  { name: 'Trending Games', slug: 'trending' },
  { name: 'Snow Rider Games', slug: 'snow-rider' },
  { name: 'Clicker', slug: 'clicker' },
  { name: 'Io', slug: 'io' },
  { name: 'Adventure', slug: 'adventure' },
  { name: '2 player', slug: '2-player' },
  { name: 'Shooting', slug: 'shooting' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Car', slug: 'car' },
  { name: 'Puzzle', slug: 'puzzle' },
  { name: 'Casual', slug: 'casual' },
  { name: 'Kids', slug: 'kids' },
];

/** Custom About content by category slug (HTML). If set, used instead of default block (desc + popular + list). */
const CATEGORY_ABOUT_BODY = {
  hot: `
<h2 class="category-about-title">Play the Most Popular Games on Snow Rider 3D</h2>
<p class="category-about-desc">Hot Games is the category that highlights the most popular and actively played browser games on Snow Rider 3D. This section is designed for players who want instant access to games that are currently trending, highly rated, and widely enjoyed by the community.</p>
<p class="category-about-desc">All games in the Hot Games category are chosen based on player engagement, play frequency, and overall popularity. These titles usually feature fast-paced gameplay, simple controls, and high replay value, making them perfect for both short sessions and longer gaming streaks.</p>
<h3 class="category-popular-heading">Why Hot Games Are So Popular</h3>
<p class="category-about-desc">Hot Games attract players because they are easy to learn but challenging to master. Many of these games focus on reaction speed, timing, and skill rather than complex rules or long tutorials. This makes them accessible to new players while still rewarding experienced gamers who aim for high scores.</p>
<p class="category-about-desc">Another reason for their popularity is instant accessibility. Every game in this category runs directly in the browser with no downloads or installations. Players can enjoy seamless gameplay on desktop and mobile devices anytime, anywhere.</p>
<h2 class="category-about-title">Discover Trending and Addictive Gameplay</h2>
<p class="category-about-desc">Hot Games is also the best place to discover new favorites before they become classics. Endless runners, arcade challenges, action games, and casual skill-based titles often rise quickly in this category due to strong word-of-mouth and shareability.</p>
<h3 class="category-popular-heading">Updated Regularly for the Latest Trends</h3>
<p class="category-about-desc">The Hot Games category is updated frequently to reflect what players love most right now. As new games gain attention and older titles lose momentum, the list evolves to stay fresh and relevant.</p>
<p class="category-about-desc">If you are new to Snow Rider 3D or simply want to play what everyone else is enjoying, Hot Games is the ideal starting point.</p>`,
  trending: `
<h2 class="category-about-title">Games That Are Rising Fast Right Now</h2>
<p class="category-about-desc">Trending Games is the category where players can find the fastest-growing and most talked-about games on Snow Rider 3D. Unlike Hot Games, which focuses on overall popularity, this section highlights titles that are gaining attention quickly and attracting new players every day.</p>
<p class="category-about-desc">These games often introduce fresh mechanics, unique visual styles, or exciting twists on familiar gameplay. Players who enjoy discovering new experiences early will find Trending Games especially rewarding. Many of today's top games first appeared in this category before becoming long-term favorites.</p>
<h3 class="category-popular-heading">What Makes a Game Trending</h3>
<p class="category-about-desc">A game becomes trending when player activity increases rapidly. This can happen due to social sharing, influencer exposure, or simply because the gameplay is highly addictive. Fast load times, simple controls, and instant fun play a big role in helping games rise in popularity.</p>
<p class="category-about-desc">Trending Games usually encourage replayability through score chasing, survival mechanics, or competitive elements. Even short play sessions feel rewarding, which keeps players coming back.</p>
<h2 class="category-about-title">Discover New and Emerging Gameplay</h2>
<p class="category-about-desc">Trending Games is the best place to explore fresh content and new ideas. Many of these titles experiment with speed, physics, or reaction-based challenges that feel exciting and unpredictable. This category is ideal for players who want something different from traditional game formats.</p>
<h3 class="category-popular-heading">Updated Frequently Based on Player Activity</h3>
<p class="category-about-desc">The Trending Games list is updated often to reflect real player behavior. As new games gain momentum, they move into this category, while older titles rotate out naturally.</p>
<p class="category-about-desc">If you enjoy staying ahead of trends and discovering the next big hit before everyone else, Trending Games is the perfect category to explore.</p>`,
  'snow-rider': `
<h2 class="category-about-title">All Snow Rider Games in One Place</h2>
<p class="category-about-desc">Snow Rider Games is the dedicated category for everything related to the Snow Rider series. Here, players can explore all versions and variations inspired by the original Snow Rider 3D gameplay. This section focuses on high-speed sledding, snowy environments, and skill-based downhill challenges.</p>
<p class="category-about-desc">Unlike general game categories, Snow Rider Games is built around a consistent theme: endless movement, increasing speed, and precise control. These games are easy to start but become increasingly intense as obstacles appear faster and require sharper reactions.</p>
<h3 class="category-popular-heading">Core Gameplay and Mechanics</h3>
<p class="category-about-desc">Most Snow Rider games follow a simple control system with left, right, and jump actions. The challenge comes from reading the terrain, timing movements correctly, and surviving as long as possible. Progress is measured by distance and performance rather than levels or upgrades, making each run feel competitive and rewarding.</p>
<h2 class="category-about-title">Designed for Speed and Replay Value</h2>
<p class="category-about-desc">Snow Rider Games are designed to be replayed many times. Each attempt feels slightly different due to speed changes, obstacle patterns, and player decisions. This creates a strong loop of improvement, where players aim to beat their previous records and refine their skills.</p>
<p class="category-about-desc">These games are optimized for browser play and work smoothly on both desktop and mobile devices. No downloads, no installations, just instant access to fast-paced action.</p>
<h3 class="category-popular-heading">Perfect for Casual and Skill-Based Players</h3>
<p class="category-about-desc">Whether you are playing casually or chasing high scores, Snow Rider Games offer a balance between simplicity and challenge. If you enjoy reflex-driven gameplay set in snowy environments, this category delivers the pure Snow Rider experience in its best form.</p>`,
  clicker: `
<h2 class="category-about-title">Simple Controls, Endless Progress</h2>
<p class="category-about-desc">Clicker Games are built around one core idea: progress through repeated actions. With just a mouse click or screen tap, players can earn points, unlock upgrades, and watch numbers grow over time. This category is perfect for players who enjoy steady rewards and a relaxing pace without complex controls.</p>
<p class="category-about-desc">On Snow Rider 3D, Clicker Games are optimized for instant play. You can start a game immediately, make progress within seconds, and return later to continue where you left off. This makes clicker games ideal for short breaks or background play.</p>
<h3 class="category-popular-heading">How Clicker Games Keep Players Engaged</h3>
<p class="category-about-desc">What makes clicker games addictive is the feeling of constant improvement. Each click contributes to visible progress, while upgrades multiply rewards and unlock new mechanics. Players are encouraged to experiment with different strategies to maximize efficiency and growth.</p>
<h2 class="category-about-title">A Relaxing Alternative to Fast-Paced Games</h2>
<p class="category-about-desc">Unlike action or racing games that require fast reflexes, Clicker Games focus on patience and planning. Many titles in this category allow idle progression, meaning the game continues to reward players even when they are not actively clicking.</p>
<p class="category-about-desc">This relaxed gameplay style appeals to players who prefer low-pressure experiences while still enjoying a sense of achievement. Clicker games are easy to understand, making them accessible to all ages.</p>
<h3 class="category-popular-heading">Play Anytime, On Any Device</h3>
<p class="category-about-desc">All Clicker Games on Snow Rider 3D run directly in the browser and are fully playable on desktop and mobile devices. No downloads, no accounts, and no interruptions.</p>
<p class="category-about-desc">If you enjoy watching progress grow step by step and unlocking upgrades at your own pace, Clicker Games offer a satisfying and stress-free gaming experience.</p>`,
  io: `
<h2 class="category-about-title">Fast Online Games with Real-Time Competition</h2>
<p class="category-about-desc">IO Games focus on quick online matches where players compete in real time. These games are designed for instant entry, allowing you to jump into a match within seconds and face other players from around the world. No long tutorials, no complicated systems—just direct competition and fast results.</p>
<p class="category-about-desc">On Snow Rider 3D, IO Games emphasize smooth performance and simple mechanics. Most titles use minimal controls but create intense gameplay through player interaction, map control, and survival-based objectives.</p>
<h3 class="category-popular-heading">Competitive by Design</h3>
<p class="category-about-desc">What defines IO Games is the presence of other players. Whether you are growing, surviving, or controlling territory, every decision matters because opponents react instantly. Matches are usually short, which encourages repeated play and constant improvement.</p>
<h2 class="category-about-title">Short Sessions, High Intensity</h2>
<p class="category-about-desc">IO Games are perfect for players who enjoy competition without long time commitments. A single match can last only a few minutes, but each session feels meaningful due to rankings, scores, or visible progression during play.</p>
<p class="category-about-desc">This category is also ideal for players who enjoy learning through experience rather than instructions. Most IO games are easy to understand but difficult to master, rewarding smart movement and situational awareness.</p>
<h3 class="category-popular-heading">Optimized for Browser and Mobile Play</h3>
<p class="category-about-desc">All IO Games on Snow Rider 3D are playable directly in your browser with no downloads required. They run smoothly on both desktop and mobile devices, making it easy to compete anytime, anywhere.</p>`,
  adventure: `
<h2 class="category-about-title">Explore, Progress, and Discover New Worlds</h2>
<p class="category-about-desc">Adventure Games are designed for players who enjoy exploration, discovery, and gradual progression. Instead of focusing only on speed or competition, this category emphasizes journeys through different environments, challenges, and story-driven experiences.</p>
<p class="category-about-desc">On Snow Rider 3D, Adventure Games often combine movement, problem-solving, and light action. Players move through levels or open paths, overcome obstacles, and unlock new areas as they advance. Each game encourages curiosity and rewards players for pushing forward.</p>
<h3 class="category-popular-heading">A Focus on Exploration and Story</h3>
<p class="category-about-desc">Many Adventure Games include simple narratives or clear goals that guide the player. Whether it is escaping danger, reaching a destination, or uncovering hidden paths, these objectives give meaning to each action and make progress feel earned.</p>
<h2 class="category-about-title">Gameplay That Balances Action and Thinking</h2>
<p class="category-about-desc">Adventure Games strike a balance between reflex-based gameplay and decision-making. Players may need to time jumps, avoid hazards, or choose the right path to continue. This mix keeps gameplay engaging without becoming overwhelming.</p>
<p class="category-about-desc">Unlike endless or score-based games, adventure titles often provide a sense of completion. Finishing a level or reaching a new checkpoint gives players a clear feeling of achievement and motivation to continue.</p>
<h3 class="category-popular-heading">Ideal for Longer Play Sessions</h3>
<p class="category-about-desc">Adventure Games are well suited for players who want to stay engaged for extended periods. Levels, progression systems, and evolving challenges create a natural flow that encourages continued play.</p>
<p class="category-about-desc">All Adventure Games on Snow Rider 3D are playable directly in the browser with no downloads required. If you enjoy immersive gameplay, exploration, and meaningful progress, Adventure Games offer a rewarding and engaging experience.</p>`,
  '2-player': `
<h2 class="category-about-title">Games Made for Two Players on the Same Screen</h2>
<p class="category-about-desc">2 Player Games are designed for shared experiences, where two players can play together on the same device or compete side by side. This category is ideal for friends, siblings, or anyone looking for interactive gameplay that goes beyond solo play.</p>
<p class="category-about-desc">Instead of playing alone against the game, players face real opponents sitting next to them. This creates instant excitement, friendly rivalry, and memorable moments that single-player games cannot replicate.</p>
<h3 class="category-popular-heading">Local Multiplayer and Head-to-Head Fun</h3>
<p class="category-about-desc">Most 2 Player Games focus on local multiplayer mechanics. Players use separate keys or controls to compete in races, battles, sports matches, or quick challenges. The rules are usually simple, allowing both players to understand the game within seconds and start playing immediately.</p>
<h2 class="category-about-title">Competitive and Cooperative Gameplay Styles</h2>
<p class="category-about-desc">This category includes both competitive and cooperative experiences. Some games are all about winning—outscoring or outlasting the other player. Others encourage teamwork, where players must cooperate to overcome obstacles or reach shared goals.</p>
<p class="category-about-desc">These different play styles make 2 Player Games highly replayable. Each match feels different depending on skill level, strategy, and interaction between players.</p>
<h3 class="category-popular-heading">Perfect for Casual and Social Play</h3>
<p class="category-about-desc">2 Player Games are easy to access and fun for all ages. They do not require accounts, downloads, or long setup times. Just open the game and start playing together.</p>
<p class="category-about-desc">All 2 Player Games on Snow Rider 3D run directly in the browser and work smoothly on desktop devices. If you are looking for fast, social, and interactive gameplay, this category offers the best shared gaming experience.</p>`,
  shooting: `
<h2 class="category-about-title">Action-Focused Games Built on Precision and Speed</h2>
<p class="category-about-desc">Shooting Games are all about accuracy, timing, and fast decision-making. This category brings together games where players must aim carefully, react quickly, and eliminate targets to survive or achieve high scores. Every second matters, and small mistakes can change the outcome instantly.</p>
<p class="category-about-desc">On Snow Rider 3D, Shooting Games are designed for smooth browser performance and instant action. Players can jump straight into gameplay without long introductions, making this category perfect for those who enjoy high-energy experiences.</p>
<h3 class="category-popular-heading">Aim, React, and Stay in Control</h3>
<p class="category-about-desc">The core of shooting gameplay lies in control. Players must track moving targets, manage positioning, and respond to threats in real time. Some games emphasize accuracy and careful shots, while others focus on fast-paced action and constant movement.</p>
<h2 class="category-about-title">Different Shooting Styles for Every Player</h2>
<p class="category-about-desc">Shooting Games come in many forms, including arcade shooters, survival-based challenges, and score-driven action games. Some titles reward precision and patience, while others push players into intense scenarios where speed is the key to success.</p>
<p class="category-about-desc">This variety keeps the category fresh and appealing to different play styles. Whether you prefer strategic aiming or non-stop action, there is always a shooting game that matches your preference.</p>
<h3 class="category-popular-heading">Instant Play, High Replay Value</h3>
<p class="category-about-desc">Most Shooting Games encourage repeated play through score systems, increasing difficulty, or time-based challenges. Each run offers a chance to improve performance and refine skills.</p>
<p class="category-about-desc">All Shooting Games on Snow Rider 3D are playable directly in the browser, with no downloads required. If you enjoy adrenaline-filled gameplay that tests reflexes and focus, Shooting Games deliver a thrilling and engaging experience.</p>`,
  sports: `
<h2 class="category-about-title">Competitive Sports Games You Can Play Instantly</h2>
<p class="category-about-desc">Sports Games are made for players who enjoy competition, skill improvement, and fair challenges. This category brings the excitement of real-world sports into fast, accessible browser games that anyone can play instantly.</p>
<p class="category-about-desc">Instead of complex simulations, Sports Games on Snow Rider 3D focus on core mechanics. Timing, positioning, and player control matter more than menus or customization. This creates a gameplay experience that feels responsive, competitive, and easy to understand.</p>
<h3 class="category-popular-heading">Skill-Based Gameplay Over Random Outcomes</h3>
<p class="category-about-desc">Most Sports Games reward precision and consistency. Whether you are aiming, passing, shooting, or defending, success depends on how well you read the situation and react. This makes each match feel earned rather than random.</p>
<h2 class="category-about-title">A Wide Range of Sports Experiences</h2>
<p class="category-about-desc">The Sports Games category includes many different play styles. Some games focus on one-on-one matches, while others simulate full team-based action in simplified form. Players can enjoy short matches or replay the same game multiple times to improve performance.</p>
<p class="category-about-desc">Because matches are usually quick, Sports Games are ideal for competitive bursts of play. You can jump in, test your skills, and try again immediately without long loading times or setups.</p>
<h3 class="category-popular-heading">Easy to Learn, Fun to Master</h3>
<p class="category-about-desc">Sports Games are accessible to beginners but rewarding for experienced players. Basic controls allow anyone to start playing within seconds, while deeper mechanics encourage mastery over time.</p>
<p class="category-about-desc">All Sports Games on Snow Rider 3D run directly in the browser with no downloads required. If you enjoy competitive gameplay driven by skill, timing, and smart decisions, Sports Games offer a satisfying and engaging way to play.</p>`,
  car: `
<h2 class="category-about-title">Drive, Race, and Test Your Control Skills</h2>
<p class="category-about-desc">Car Games are built around movement, control, and speed. This category is for players who enjoy driving challenges, racing against time, or navigating difficult tracks using precise steering and quick reactions. Every turn, drift, and acceleration directly affects the outcome of the game.</p>
<p class="category-about-desc">On Snow Rider 3D, Car Games focus on responsive handling rather than complex realism. Controls are easy to learn, allowing players to start driving immediately, while the challenge increases through track design, obstacles, and speed.</p>
<h3 class="category-popular-heading">The Importance of Timing and Control</h3>
<p class="category-about-desc">Success in Car Games depends on how well players manage momentum. Braking too late, turning too sharply, or accelerating at the wrong moment can cost valuable time. These mechanics encourage players to improve lap after lap and develop better driving instincts.</p>
<h2 class="category-about-title">More Than Just Racing</h2>
<p class="category-about-desc">Not all Car Games are about reaching the finish line first. Some focus on obstacle courses, stunt challenges, or precision driving in tight spaces. Others test how long players can stay on the road while avoiding hazards and maintaining control.</p>
<p class="category-about-desc">This variety makes Car Games appealing to both casual players and those who enjoy skill-based challenges. Each game offers a different driving experience, keeping the category fresh and engaging.</p>
<h3 class="category-popular-heading">Smooth Browser Gameplay on Any Device</h3>
<p class="category-about-desc">All Car Games on Snow Rider 3D run directly in the browser and are optimized for smooth performance. No downloads or installations are required, making it easy to jump into a driving session anytime.</p>
<p class="category-about-desc">If you enjoy speed, control, and mastering movement, Car Games deliver exciting gameplay that rewards practice and precision.</p>`,
  puzzle: `
<h2 class="category-about-title">Think Carefully and Solve Meaningful Challenges</h2>
<p class="category-about-desc">Puzzle Games are designed for players who enjoy thinking, planning, and solving problems step by step. Instead of fast reactions, this category focuses on logic, observation, and smart decision-making. Every level challenges the player to find the correct solution rather than rely on speed.</p>
<p class="category-about-desc">On Snow Rider 3D, Puzzle Games offer clear rules and structured challenges. Players are encouraged to analyze each situation, experiment with different approaches, and learn from mistakes. This creates a calm but deeply engaging gameplay experience.</p>
<h3 class="category-popular-heading">Gameplay Built Around Logic and Strategy</h3>
<p class="category-about-desc">Most Puzzle Games introduce simple mechanics at first, then gradually increase complexity. Players may need to match patterns, move objects, unlock paths, or trigger sequences in the correct order. Progress comes from understanding the rules, not memorizing actions.</p>
<h2 class="category-about-title">A Relaxed Pace with Strong Satisfaction</h2>
<p class="category-about-desc">Puzzle Games are ideal for players who prefer a slower, more thoughtful pace. There is usually no time pressure, allowing players to focus fully on solving each challenge. Completing a difficult puzzle provides a strong sense of achievement and mental satisfaction.</p>
<p class="category-about-desc">These games are also highly replayable. Many players return to improve efficiency, try alternative solutions, or revisit favorite puzzles.</p>
<h3 class="category-popular-heading">Accessible on Desktop and Mobile</h3>
<p class="category-about-desc">All Puzzle Games on Snow Rider 3D are playable directly in the browser and work smoothly across devices. No downloads, no interruptions, just pure problem-solving gameplay.</p>
<p class="category-about-desc">If you enjoy games that challenge your mind and reward careful thinking, Puzzle Games offer a focused and rewarding experience.</p>`,
  casual: `
<h2 class="category-about-title">Easy-to-Play Games for Quick and Relaxing Fun</h2>
<p class="category-about-desc">Casual Games are created for simple enjoyment. This category is perfect for players who want to relax, have fun, and play without pressure. The focus is on easy controls, clear objectives, and instant entertainment that anyone can enjoy.</p>
<p class="category-about-desc">On Snow Rider 3D, Casual Games are designed to be welcoming. You can start playing immediately without learning complex rules or mastering advanced skills. These games are ideal for short breaks, casual sessions, or moments when you just want to unwind.</p>
<h3 class="category-popular-heading">Designed for Instant Understanding</h3>
<p class="category-about-desc">Most Casual Games can be understood within seconds. Players are guided naturally through gameplay using visuals and intuitive mechanics rather than long instructions. This makes the experience smooth and enjoyable for all ages.</p>
<h2 class="category-about-title">Light Gameplay with High Replay Value</h2>
<p class="category-about-desc">Casual Games may feel simple at first, but many of them are surprisingly engaging. Score systems, small challenges, and gradual difficulty increases encourage players to replay and improve without frustration.</p>
<p class="category-about-desc">Because the gameplay is flexible and forgiving, players can stop and return at any time. This makes Casual Games a great choice for both quick play sessions and longer relaxed gaming periods.</p>
<h3 class="category-popular-heading">Perfect for All Devices and Skill Levels</h3>
<p class="category-about-desc">All Casual Games on Snow Rider 3D run directly in the browser and are optimized for both desktop and mobile devices. No downloads, no setup, and no commitment required.</p>
<p class="category-about-desc">If you are looking for stress-free fun that fits into any moment of the day, Casual Games offer an enjoyable and accessible gaming experience.</p>`,
  kids: `
<h2 class="category-about-title">Safe and Fun Games Designed for Kids</h2>
<p class="category-about-desc">Kids Games is a category created specifically for young players. These games focus on fun, simplicity, and safety, offering an environment where children can play comfortably while parents feel confident about the content.</p>
<p class="category-about-desc">On Snow Rider 3D, Kids Games avoid complex mechanics and intense action. Instead, they emphasize colorful visuals, clear objectives, and friendly gameplay that is easy to understand from the very first moment.</p>
<h3 class="category-popular-heading">Simple Gameplay Made for Young Players</h3>
<p class="category-about-desc">Most Kids Games use basic controls and straightforward goals. Players can move, match, collect, or interact without needing fast reactions or advanced skills. This helps children enjoy the game without frustration and build confidence as they play.</p>
<h2 class="category-about-title">Learning Through Play</h2>
<p class="category-about-desc">Many Kids Games subtly encourage learning and development. Problem-solving, hand-eye coordination, memory, and logical thinking are often part of the gameplay, even when the game feels purely entertaining.</p>
<p class="category-about-desc">By combining play with light cognitive challenges, these games support healthy mental development while keeping the experience fun and engaging.</p>
<h3 class="category-popular-heading">Friendly Content and Easy Access</h3>
<p class="category-about-desc">Kids Games on Snow Rider 3D are designed to be family-friendly. They do not require downloads, accounts, or complicated setup steps. Children can start playing instantly in a safe browser-based environment.</p>
<p class="category-about-desc">All games work smoothly on desktop and mobile devices, making them suitable for home or on-the-go play. If you are looking for enjoyable, age-appropriate games for children, Kids Games provide a safe and entertaining choice.</p>`,
};

/** Meta title + meta description + OG title + OG description by category slug (page 1). Page 2+ use name + " – Page N". */
const CATEGORY_META = {
  hot: { title: 'Hot Games – Play the Most Popular Browser Games Online', description: 'Play the hottest and most popular browser games right now. Discover top-rated games loved by players on Snow Rider 3D, playable instantly with no download.', ogTitle: 'Hot Games You Can\'t Miss – Play the Most Popular Games Online', ogDescription: 'Jump into the most played games right now. Discover hot browser games loved by millions and start playing instantly on Snow Rider 3D.' },
  trending: { title: 'Trending Games – New and Rising Games to Play Now', description: 'Explore trending games that are rising fast in popularity. Discover new browser games before they become hits, updated regularly on Snow Rider 3D.', ogTitle: 'Trending Games Right Now – Discover What Players Love', ogDescription: 'Find the games everyone is talking about. Explore fast-rising browser games and play them before they go viral.' },
  'snow-rider': { title: 'Snow Rider Games – Play Snow Rider 3D and Similar Games', description: 'Play all Snow Rider games in one place. Enjoy fast-paced sledding, endless downhill action, and skill-based gameplay inspired by Snow Rider 3D.', ogTitle: 'Snow Rider Games – Fast Snowy Action Awaits', ogDescription: 'Experience high-speed downhill action with Snow Rider games. Test your reflexes and enjoy endless snowy fun online.' },
  clicker: { title: 'Clicker Games – Relaxing Incremental Games Online', description: 'Enjoy simple and addictive clicker games. Tap, upgrade, and progress at your own pace with browser-based clicker games on Snow Rider 3D.', ogTitle: 'Clicker Games – Simple, Addictive, and Relaxing', ogDescription: 'Tap, upgrade, and watch your progress grow. Enjoy relaxing clicker games that are easy to play and hard to stop.' },
  io: { title: 'IO Games – Real-Time Multiplayer Games in Browser', description: 'Play fast-paced IO games with real-time multiplayer action. Compete against other players instantly in browser games with no download required.', ogTitle: 'IO Games – Compete Live with Other Players', ogDescription: 'Join real-time multiplayer battles and prove your skills. Play fast IO games online with players from around the world.' },
  adventure: { title: 'Adventure Games – Explore, Progress, and Discover Worlds', description: 'Dive into adventure games full of exploration, challenges, and progression. Play immersive browser adventure games online on Snow Rider 3D.', ogTitle: 'Adventure Games – Explore New Worlds Online', ogDescription: 'Start your journey and discover exciting worlds. Play adventure games filled with exploration, challenges, and progress.' },
  '2-player': { title: '2 Player Games – Play Together on the Same Device', description: 'Play fun 2 player games with friends on one device. Enjoy competitive and cooperative browser games designed for shared local play.', ogTitle: '2 Player Games – Play Together and Compete', ogDescription: 'Challenge your friends or play side by side. Enjoy fun 2 player games designed for shared local play.' },
  shooting: { title: 'Shooting Games – Action and Aim-Based Browser Games', description: 'Test your aim and reflexes with exciting shooting games. Play fast-action shooter games online with smooth browser performance.', ogTitle: 'Shooting Games – Aim Fast, Act Faster', ogDescription: 'Lock on, react quickly, and survive intense action. Play shooting games that test your aim and reflexes online.' },
  sports: { title: 'Sports Games – Skill-Based Competitive Games Online', description: 'Play sports games that focus on skill, timing, and competition. Enjoy fast and accessible browser sports games on Snow Rider 3D.', ogTitle: 'Sports Games – Compete, Score, and Win', ogDescription: 'Feel the thrill of competition. Play sports games where skill, timing, and smart moves decide the winner.' },
  car: { title: 'Car Games – Driving and Racing Games Online', description: 'Drive, race, and master control in exciting car games. Play browser-based driving and racing games with smooth controls and instant access.', ogTitle: 'Car Games – Drive Fast and Stay in Control', ogDescription: 'Race through tracks and master your driving skills. Enjoy exciting car games with smooth browser gameplay.' },
  puzzle: { title: 'Puzzle Games – Logic and Brain Games to Play Online', description: 'Challenge your mind with puzzle games that reward logic and thinking. Play relaxing and engaging brain games directly in your browser.', ogTitle: 'Puzzle Games – Think Smart and Solve Challenges', ogDescription: 'Put your brain to work with clever puzzles. Enjoy satisfying problem-solving games you can play anytime.' },
  casual: { title: 'Casual Games – Easy and Fun Games for Everyone', description: 'Relax with casual games that are easy to play and fun for all ages. Enjoy quick browser games perfect for short breaks and stress-free play.', ogTitle: 'Casual Games – Easy Fun for Any Moment', ogDescription: 'Relax and enjoy light, fun gameplay. Casual games made for quick breaks and stress-free play.' },
  kids: { title: 'Kids Games – Safe and Fun Games for Children', description: 'Discover safe and kid-friendly games designed for young players. Play fun, simple, and educational browser games for kids on Snow Rider 3D.', ogTitle: 'Kids Games – Safe and Fun Games for Children', ogDescription: 'Fun, friendly, and safe games made for kids. Let children enjoy simple and enjoyable games online.' },
};

/** Map rawKey (slugified from game.categories) -> fixed slug (hot, sports, clicker, ...). */
const GAME_CAT_RAW_TO_FIXED = {
  'hot-games': 'hot',
  'trending-games': 'trending',
  'trending': 'trending',
  'snow-rider': 'snow-rider',
  'snow-rider-games': 'snow-rider',
  'clicker': 'clicker',
  'io': 'io',
  'adventure': 'adventure',
  '2-player': '2-player',
  '2-player-games': '2-player',
  'shooting': 'shooting',
  'sports': 'sports',
  'car': 'car',
  'puzzle': 'puzzle',
  'casual': 'casual',
  'kids': 'kids',
};

function getCategoryMain(game) {
  let cat = game.categoryMain ? { ...game.categoryMain } : null;
  if (!cat) {
    const cats = game.categories || [];
    if (!cats.length) return { name: 'All Games', slug: 'all' };
    const prioritySlugs = CATEGORY_PRIORITY.map((n) => slugify(n, 80));
    for (const pSlug of prioritySlugs) {
      const found = cats.find((c) => slugify(String(c.slug ?? c.name ?? ''), 80) === pSlug);
      if (found) { cat = found; break; }
    }
    if (!cat) cat = cats[0];
  }
  if (cat && slugify(cat.slug ?? cat.name ?? '', 80) === 'new-games') {
    const other = (game.categories || []).find((c) => slugify(c.slug ?? c.name ?? '', 80) !== 'new-games');
    return other || { name: 'All Games', slug: 'all' };
  }
  return cat || { name: 'All Games', slug: 'all' };
}

function getRelatedGames(games, currentSlug, categorySlugCanonical, limit = RELATED_LIMIT, categoryCanonicalSlugMap) {
  const toCanonical = (c) => (categoryCanonicalSlugMap && c)
    ? (categoryCanonicalSlugMap.get(slugify(c.slug ?? c.name ?? 'games', 80)) || slugify(c.slug ?? c.name ?? 'games', 80))
    : (c && (c.slug || c.name)) ? slugify(c.slug ?? c.name, 80) : '';
  const sameCategory = games.filter((g) => {
    if (g.slug === currentSlug) return false;
    const cat = getCategoryMain(g);
    const gCanon = toCanonical(cat);
    if (gCanon === categorySlugCanonical) return true;
    return (g.categories || []).some((c) => toCanonical(c) === categorySlugCanonical);
  });
  if (sameCategory.length >= limit) return sameCategory.slice(0, limit);
  const rest = games.filter((g) => g.slug !== currentSlug && !sameCategory.find((s) => s.slug === g.slug));
  return [...sameCategory, ...rest].slice(0, limit);
}

function buildGamePageContent(gameTemplate, game, games, categoryCanonicalSlugMap) {
  const name = game.name || '';
  const slug = game.slug || '';
  const shortDesc = game.description || '';
  const desc = escapeHtml(shortDesc);
  const aboutPath = path.join(contentDir, 'games', `${slug}-about.html`);
  const aboutBody = fs.existsSync(aboutPath)
    ? fs.readFileSync(aboutPath, 'utf8').trim()
    : desc;
  const image = (game.image || '').replace(/"/g, '&quot;');
  const cat = getCategoryMain(game);
  const catSlugCanonical = (categoryCanonicalSlugMap && slugify(cat.slug ?? cat.name ?? '', 80))
    ? (categoryCanonicalSlugMap.get(slugify(cat.slug ?? cat.name ?? 'games', 80)) || slugify(cat.slug ?? cat.name ?? 'games', 80))
    : slugify(cat.slug ?? cat.name ?? 'games', 80);
  const gameLink = gameUrl(slug);
  const catLink = categoryUrl(catSlugCanonical);

  let html = gameTemplate
    .replace(/<!-- GAME:TITLE -->/g, escapeHtml(name))
    .replace(/<!-- GAME:DESCRIPTION -->/, aboutBody);

  const thumbHtml = `<img alt="${escapeHtml(name)} game thumbnail" height="80" src="${image}" title="${escapeHtml(name)}" width="80" />`;
  html = html.replace('<!-- GAME:THUMBNAIL -->', thumbHtml);

  const iframeUrl = game.iframeUrl || '';
  const iframeBlock = `<div class="game-flow game-flow--iframe" style="padding:0;margin-bottom:0"><iframe allowfullscreen="" border="0" class="iframe-default" frameborder="0" height="480" id="iframehtml5" scrolling="no" src="${escapeHtml(iframeUrl)}" title="${escapeHtml(name)}" width="100%"></iframe></div>`;
  html = html.replace('<!-- GAME:IFRAME -->', iframeBlock);

  const breadcrumbHtml = `<a class="bread-crumb-item" href="/"><svg fill="#fff" height="20" viewbox="0 0 64 64" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M 32 3 L 1 28 L 1.4921875 28.654297 C 2.8591875 30.477297 5.4694688 30.791703 7.2304688 29.345703 L 32 9 L 56.769531 29.345703 C 58.530531 30.791703 61.140812 30.477297 62.507812 28.654297 L 63 28 L 54 20.742188 L 54 8 L 45 8 L 45 13.484375 L 32 3 z M 32 13 L 8 32 L 8 56 L 56 56 L 56 35 L 32 13 z M 26 34 L 38 34 L 38 52 L 26 52 L 26 34 z"></path></svg></a><span class="bread-crumb-sep">»</span><a class="bread-crumb-item bread-crumb-cat" href="${catLink}">${escapeHtml(cat.name)}</a><span class="bread-crumb-sep">»</span><span class="bread-crumb-item bread-crumb-current">${escapeHtml(name)}</span>`;
  html = html.replace('<!-- GAME:BREADCRUMB -->', breadcrumbHtml);

  const categoryTagHtml = `<a class="us-sticker game-cate-link" href="${catLink}">${escapeHtml(cat.name)}</a>`;
  html = html.replace('<!-- GAME:CATEGORY_TAG -->', categoryTagHtml);

  const related = getRelatedGames(games, slug, catSlugCanonical, RELATED_LIMIT, categoryCanonicalSlugMap);
  const relatedBlock = extractBetween(html, '<!-- GAME:RELATED_START -->', '<!-- GAME:RELATED_END -->');
  const cardTemplate = extractCardTemplate(relatedBlock);
  if (cardTemplate) {
    const cards = related.map((g) => renderCard(cardTemplate, g)).join('\n\t\t\t\t\t\t\t');
    html = replaceBetween(html, '<!-- GAME:RELATED_START -->', '<!-- GAME:RELATED_END -->', cards);
  }

  const otherGames = [...games]
    .filter((g) => g.slug !== slug)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, GAME_PAGE_NEW_GAMES_LIMIT);
  const hotGamesBlock = extractBetween(html, '<!-- GAME:HOT_GAMES_START -->', '<!-- GAME:HOT_GAMES_END -->');
  const hotGamesCardTemplate = extractHotGamesCardTemplate(hotGamesBlock);
  if (hotGamesCardTemplate) {
    const hotGamesCards = otherGames.map((g) => renderCard(hotGamesCardTemplate, g)).join('\n\t\t\t\t\t\t\t');
    html = replaceBetween(html, '<!-- GAME:HOT_GAMES_START -->', '<!-- GAME:HOT_GAMES_END -->', hotGamesCards);
  }

  const newGames = otherGames;
  const newGamesBlock = extractBetween(html, '<!-- GAME:NEW_GAMES_START -->', '<!-- GAME:NEW_GAMES_END -->');
  const newGamesCardTemplate = extractNewGamesCardTemplate(newGamesBlock);
  if (newGamesCardTemplate) {
    const newGamesCards = newGames.map((g) => renderCard(newGamesCardTemplate, g)).join('\n\t\t\t\t\t\t\t');
    html = replaceBetween(html, '<!-- GAME:NEW_GAMES_START -->', '<!-- GAME:NEW_GAMES_END -->', newGamesCards);
  }

  return html;
}

/**
 * Game page JSON-LD: one @graph with BreadcrumbList + WebPage + VideoGame.
 * All URLs absolute; canonical = base + /slug/.
 */
function gamePageSchemaGraph(game, baseUrl, categoryCanonicalSlugMap) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  const slug = game.slug || '';
  const gameUrlAbs = `${base}/${slug}`;
  const imageAbs = game.image
    ? (game.image.startsWith('http') ? game.image : `${base}${game.image.startsWith('/') ? game.image : '/' + game.image}`)
    : '';
  const cat = getCategoryMain(game);
  const catSlugCanonical = (categoryCanonicalSlugMap && (cat.slug || cat.name))
    ? (categoryCanonicalSlugMap.get(slugify(cat.slug ?? cat.name ?? 'games', 80)) || slugify(cat.slug ?? cat.name ?? 'games', 80))
    : slugify(cat.slug ?? cat.name ?? 'games', 80);
  const categoryPath = categoryUrl(catSlugCanonical);
  const categoryUrlAbs = `${base}${categoryPath.startsWith('/') ? categoryPath : '/' + categoryPath}`;
  const homeUrl = `${base}/`;

  const breadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: homeUrl },
      { '@type': 'ListItem', position: 2, name: cat.name, item: categoryUrlAbs },
      { '@type': 'ListItem', position: 3, name: game.name, item: gameUrlAbs },
    ],
  };

  const webPage = {
    '@type': 'WebPage',
    name: game.name,
    url: gameUrlAbs,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: homeUrl },
  };

  const schemaDesc = game.description && game.description.trim()
    ? truncateDesc(sanitizeGameDescription(game.description), 160)
    : gameDescriptionFallback(game);
  const videoGame = {
    '@type': 'VideoGame',
    name: game.name,
    url: gameUrlAbs,
    description: schemaDesc,
    image: imageAbs ? [imageAbs] : undefined,
    genre: (game.categories || []).map((c) => c.name).filter(Boolean),
    operatingSystem: 'Web',
    applicationCategory: 'Game',
    inLanguage: 'en',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: homeUrl },
  };
  if (videoGame.genre && videoGame.genre.length === 0) delete videoGame.genre;
  if (game.updatedAt) videoGame.dateModified = game.updatedAt.slice(0, 10);
  if (game.ratingValue != null && game.ratingCount != null) {
    videoGame.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(game.ratingValue),
      ratingCount: String(game.ratingCount),
      bestRating: '5',
      worstRating: '1',
    };
  }
  videoGame.offers = { '@type': 'Offer', price: '0', priceCurrency: 'USD' };

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbList, webPage, videoGame],
  };
  return `<script type="application/ld+json">\n${JSON.stringify(graph)}\n\t</script>`;
}

function websiteSchemaWithSearch(baseUrl) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : '';
  const homeUrl = base ? base + '/' : '/';
  const searchUrl = base ? base + '/search/?q={search_term_string}' : '/search/?q={search_term_string}';
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: homeUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: searchUrl },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Home page: JSON-LD @graph with WebSite + Organization + VideoGame (entity signal). */
function homeSchemaGraph(baseUrl) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL;
  const homeUrl = base + '/';
  const searchTarget = base + '/search?q={search_term_string}';
  const logoUrl = base + '/data/image/logo-snow-rider-3d.png';
  const ogImageUrl = base + '/data/image/snow-rider-3d-og-image.png';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: homeUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: searchTarget },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        name: SITE_NAME,
        url: homeUrl,
        logo: logoUrl,
      },
      {
        '@type': 'VideoGame',
        name: 'Snow Rider 3D',
        url: homeUrl,
        description: 'Steer your sled down snowy hills, dodge obstacles, and collect items. Snow Rider 3D brings fast winter racing to your browser.',
        genre: ['Arcade', 'Racing', 'Casual'],
        image: ogImageUrl,
        operatingSystem: 'Web',
        applicationCategory: 'Game',
        inLanguage: 'en',
      },
    ],
  };
}

function webPageSchema(title, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url,
  };
}

/**
 * Static pages only: WebPage with inLanguage and isPartOf (WebSite).
 * NO VideoGame, Article, BlogPosting. All URLs must be absolute.
 */
function staticPageSchema(pageName, pageUrl, siteName, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pageName,
    url: pageUrl,
    inLanguage: 'en',
    isPartOf: {
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl.endsWith('/') ? siteUrl : siteUrl + '/',
    },
  };
}

/** Static page title: "{Page Name} | SiteName", 40–60 chars. */
function staticMetaTitle(pageTitle, siteName) {
  const t = `${String(pageTitle || '').trim()} | ${String(siteName || SITE_NAME).trim()}`;
  if (t.length <= 60) return t;
  const part = String(pageTitle || '').trim();
  const short = `${part.slice(0, Math.max(0, 60 - 3 - SITE_NAME.length))}... | ${SITE_NAME}`;
  return short.length <= 60 ? short : short.slice(0, 57) + '...';
}

/**
 * Redirect page for HOME_GAME_SLUG: /snow-rider-3d → canonical and redirect to /
 */
function buildRedirectToHomePage(slug, baseUrl) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  const homeUrl = base + '/';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Snow Rider 3D – Redirect</title>
  <link rel="canonical" href="${homeUrl}">
  <meta name="robots" content="noindex,follow">
  <meta http-equiv="refresh" content="0;url=${homeUrl}">
  <script>window.location.replace(${JSON.stringify(homeUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${homeUrl}">Snow Rider 3D</a>…</p>
</body>
</html>`;
  return html;
}

function buildGamePages(baseHtml, gameTemplate, games, baseUrl, categoryCanonicalSlugMap) {
  if (!games.length) return;
  const baseUrlForGame = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  for (const game of games) {
    const slug = game.slug;
    if (!slug) continue;

    if (slug === HOME_GAME_SLUG) {
      const redirectHtml = buildRedirectToHomePage(slug, baseUrlForGame);
      writeDist(`${slug}.html`, redirectHtml);
      writeDist(`${slug}/index.html`, redirectHtml);
      continue;
    }

    const content = buildGamePageContent(gameTemplate, game, games, categoryCanonicalSlugMap);
    let fullHtml = buildPage(baseHtml, content, 'game');

    const gamePath = `/${slug}`;
    const title = gameMetaTitle(game.name, SITE_NAME);
    const desc = gameMetaDescription(game);
    const ogDesc = gameOgDescription(desc, game.name, SITE_NAME);
    const imageAbs = game.image
      ? (game.image.startsWith('http') ? game.image : `${baseUrlForGame}${game.image.startsWith('/') ? game.image : '/' + game.image}`)
      : '';

    fullHtml = injectMetaAndOG(fullHtml, {
      title,
      desc,
      ogDesc,
      canonical: gamePath,
      image: imageAbs,
      url: gamePath,
      baseUrl: baseUrlForGame,
    });
    fullHtml = fullHtml.replace(/<meta name="keywords"[^>]*>\s*/gi, '');
    fullHtml = injectJsonLd(fullHtml, gamePageSchemaGraph(game, baseUrlForGame, categoryCanonicalSlugMap));

    const canonicalFull = baseUrlForGame + gamePath;
    fullHtml = fullHtml.replace(/__GAME_CANONICAL_URL__/g, canonicalFull);
    fullHtml = replaceCategoryLinks(fullHtml, categoryCanonicalSlugMap);
    fullHtml = replaceGameLinks(fullHtml);
    writeDist(`${slug}.html`, fullHtml);
    writeDist(`${slug}/index.html`, fullHtml);
  }
}

/**
 * Build categories map: 13 fixed (nav) + extra from games. Returns map keyed by canonical slug
 * and raw->canonical map for resolving /category/xxx links. Nav links always have a page, no 404.
 */
function deriveCategoriesMap(games) {
  const usedCategorySlugs = new Set();
  const categoriesMap = new Map();
  const categoryCanonicalSlugMap = new Map();
  const categorySlugChanges = [];

  // 1) Always have 13 fixed categories (match nav) + All Games (/all.games/)
  for (const cat of FIXED_CATEGORIES) {
    usedCategorySlugs.add(cat.slug);
    categoriesMap.set(cat.slug, { name: cat.name, slug: cat.slug, games: [] });
    const rawFromName = slugify(cat.name, 80);
    categoryCanonicalSlugMap.set(cat.slug, cat.slug);
    categoryCanonicalSlugMap.set(rawFromName, cat.slug);
    if (rawFromName !== cat.slug) categoryCanonicalSlugMap.set(cat.slug, cat.slug);
  }
  usedCategorySlugs.add('all');
  categoriesMap.set('all', { name: 'All Games', slug: 'all', games: [] });
  categoryCanonicalSlugMap.set('all', 'all');
  Object.entries(GAME_CAT_RAW_TO_FIXED).forEach(([raw, fixed]) => {
    categoryCanonicalSlugMap.set(raw, fixed);
  });

  // 2) Categories from games that do not map to fixed -> add to map (so breadcrumb/link do not 404)
  const rawToExtra = new Map();
  for (const game of games) {
    const list = game.categories || [];
    for (const c of list) {
      const rawKey = slugify(c.slug ?? c.name ?? 'games', 80) || 'games';
      if (rawKey === 'new-games') continue;
      if (categoryCanonicalSlugMap.has(rawKey)) continue;
      if (rawToExtra.has(rawKey)) continue;
      const canonicalSlug = normalizeAndValidateSlug(rawKey, usedCategorySlugs, RESERVED_SLUGS, '-cat', 80);
      rawToExtra.set(rawKey, { slug: canonicalSlug, name: c.name || rawKey });
      if (canonicalSlug !== rawKey) {
        categorySlugChanges.push({ type: 'category', old: rawKey, new: canonicalSlug, name: c.name });
      }
    }
  }
  for (const [raw, { slug, name }] of rawToExtra) {
    categoriesMap.set(slug, { name, slug, games: [] });
    categoryCanonicalSlugMap.set(raw, slug);
  }

  // 3) Assign game to category: fixed (via GAME_CAT_RAW_TO_FIXED) or extra
  for (const game of games) {
    const addedSlugs = new Set();
    if (/snow\s*rider/i.test(game.name || '')) {
      const entry = categoriesMap.get('snow-rider');
      if (entry && !entry.games.some((g) => g.slug === game.slug)) {
        entry.games.push(game);
        addedSlugs.add('snow-rider');
      }
    }
    const list = game.categories || [];
    for (const c of list) {
      const rawKey = slugify(c.slug ?? c.name ?? 'games', 80) || 'games';
      const canonicalSlug = GAME_CAT_RAW_TO_FIXED[rawKey] ?? categoryCanonicalSlugMap.get(rawKey) ?? rawKey;
      const entry = categoriesMap.get(canonicalSlug);
      if (entry && !entry.games.some((g) => g.slug === game.slug)) entry.games.push(game);
    }
  }

  // 4) All Games: add all games to category "all"
  const allEntry = categoriesMap.get('all');
  if (allEntry) allEntry.games = [...games];

  return { categoriesMap, categoryCanonicalSlugMap, categorySlugChanges };
}

/** Category page title: 50–60 chars, categoryName + brand, no ALL CAPS. */
function categoryMetaTitle(categoryName, page, totalPages, siteName) {
  const displayName = (categoryName || '').toLowerCase().endsWith(' games') ? categoryName : categoryName + ' Games';
  const suffix = ` | ${siteName}`;
  if (totalPages > 1) {
    const t = `${displayName} – Page ${page}${suffix}`;
    return t.length <= 60 ? t : `${displayName} – Page ${page} | ${siteName}`.slice(0, 60);
  }
  const t = `${displayName} – New & Popular Picks${suffix}`;
  return t.length <= 60 ? t : (displayName + suffix).slice(0, 60);
}

/** Category meta description: 120–160 chars, no "free/online/no download", unique per category. */
function categoryMetaDesc(categoryName) {
  const name = (categoryName || '').toLowerCase().endsWith(' games') ? categoryName : categoryName + ' Games';
  const raw = `Browse ${name} and discover new picks. Find your next favorite in this collection. We add new titles regularly. Start playing now.`;
  return truncateDesc(raw, 160);
}

/** OG/Twitter description: similar to meta but not identical. */
function categoryOgDesc(categoryName) {
  const name = (categoryName || '').toLowerCase().endsWith(' games') ? categoryName : categoryName + ' Games';
  return truncateDesc(`Explore ${name}. New and popular picks in this collection.`, 160);
}

/**
 * Category page JSON-LD: one @graph with BreadcrumbList + CollectionPage + ItemList (10–20 games).
 * All URLs absolute; canonical matches real page.
 */
function categoryPageSchemaGraph(category, gamesForPage, categoryPathWithPage, baseUrl) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  const pathNorm = (categoryPathWithPage || '').replace(/^\/|\/$/g, '');
  const canonicalUrl = pathNorm ? `${base}/${pathNorm}/` : `${base}/`;
  const homeUrl = `${base}/`;
  const categoryName = (category.name || '').toLowerCase().endsWith(' games') ? category.name : category.name + ' Games';

  const graph = [];

  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: homeUrl },
      { '@type': 'ListItem', position: 2, name: categoryName, item: canonicalUrl },
    ],
  });

  graph.push({
    '@type': 'CollectionPage',
    name: categoryName,
    url: canonicalUrl,
    description: `Browse ${categoryName} and discover new picks in this collection.`,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: homeUrl },
  });

  const topGames = (gamesForPage || []).slice(0, 20).filter((g) => g && g.slug && g.name);
  if (topGames.length) {
    graph.push({
      '@type': 'ItemList',
      itemListElement: topGames.map((g, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${base}/${g.slug}/`,
        name: g.name,
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

/** Legacy: single BreadcrumbList (replaced by categoryPageSchemaGraph for category pages). */
function categoryPageSchema(category, categoryPath, baseUrl) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : '';
  const url = base ? base + '/' + categoryPath + '/' : '/' + categoryPath + '/';
  const homeItem = base ? base + '/' : '/';
  const itemName = (category.name || '').toLowerCase().endsWith(' games') ? category.name : category.name + ' Games';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: homeItem },
      { '@type': 'ListItem', position: 2, name: itemName, item: url },
    ],
  };
}

function buildCategoryPages(baseHtml, categoryTemplate, categoriesMap, baseUrl, categoryCanonicalSlugMap) {
  if (!categoriesMap.size) return;
  const baseUrlForCategory = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  const perPage = CATEGORY_GAMES_PER_PAGE;
  for (const [slug, category] of categoriesMap) {
    const allGames = category.games || [];
    const totalGames = allGames.length;
    const totalPages = Math.max(1, Math.ceil(totalGames / perPage));
    const categoryPath = categoryPagePath(slug);

    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * perPage;
      const gamesForPage = allGames.slice(start, start + perPage);
      const pagination = { page, totalPages, totalGames };
      const content = buildCategoryPageContent(categoryTemplate, { ...category, games: gamesForPage }, pagination);
      let fullHtml = buildPage(baseHtml, content, 'category');

      const name = category.name || slug;
      const metaOverride = CATEGORY_META[slug];
      const title = metaOverride
        ? (page > 1 ? `${name} – Page ${page} | ${SITE_NAME}` : `${metaOverride.title} | ${SITE_NAME}`)
        : categoryMetaTitle(name, page, totalPages, SITE_NAME);
      const desc = metaOverride ? truncateDesc(metaOverride.description, 160) : categoryMetaDesc(name);
      const ogTitle = metaOverride && metaOverride.ogTitle ? metaOverride.ogTitle : null;
      const ogDesc = metaOverride ? truncateDesc(metaOverride.ogDescription || metaOverride.description, 160) : categoryOgDesc(name);
      const canonicalPath = page <= 1 ? `/${categoryPath}/` : `/${categoryPath}/page/${page}/`;
      const categoryOgImage = baseUrlForCategory + '/data/image/snow-rider-3d-og-image.png';

      fullHtml = injectMetaAndOG(fullHtml, {
        title,
        desc,
        ogTitle: page > 1 ? null : ogTitle,
        ogDesc,
        canonical: canonicalPath,
        baseUrl: baseUrlForCategory,
        image: categoryOgImage,
        url: canonicalPath,
      });

      const schemaPath = page <= 1 ? categoryPath : `${categoryPath}/page/${page}`;
      const schemaGraph = categoryPageSchemaGraph(
        { ...category, games: gamesForPage },
        gamesForPage,
        schemaPath,
        baseUrlForCategory
      );
      fullHtml = injectJsonLd(fullHtml, `<script type="application/ld+json">\n${JSON.stringify(schemaGraph)}\n\t</script>`);

      fullHtml = fullHtml.replace(/<meta name="keywords"[^>]*>/gi, '');

      fullHtml = replaceCategoryLinks(fullHtml, categoryCanonicalSlugMap);
      fullHtml = replaceGameLinks(fullHtml);
      const outPath = page <= 1 ? `${categoryPath}/index.html` : `${categoryPath}/page/${page}/index.html`;
      writeDist(outPath, fullHtml);
    }
  }
}

function buildCategoryPageContent(categoryTemplate, category, pagination = { page: 1, totalPages: 1, totalGames: 0 }) {
  const name = category.name || '';
  const slug = category.slug || '';
  const displayGames = category.games || [];
  const { page, totalPages, totalGames } = pagination;
  const count = totalGames;
  const aboutTitle = name.toLowerCase().endsWith(' games') ? name : name + ' Games';
  const desc = escapeHtml(`Browse ${aboutTitle} and play free online in your browser.`);
  const breadcrumbTail = page > 1
    ? `<a class="bread-crumb-item" href="${categoryUrl(slug)}">${escapeHtml(aboutTitle)}</a><span class="bread-crumb-sep">»</span><span class="bread-crumb-item bread-crumb-current">Page ${page}</span>`
    : `<span class="bread-crumb-item bread-crumb-current">${escapeHtml(aboutTitle)}</span>`;
  const breadcrumbHtml = `<a class="bread-crumb-item" href="/"><svg fill="#fff" height="20" viewbox="0 0 64 64" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M 32 3 L 1 28 L 1.4921875 28.654297 C 2.8591875 30.477297 5.4694688 30.791703 7.2304688 29.345703 L 32 9 L 56.769531 29.345703 C 58.530531 30.791703 61.140812 30.477297 62.507812 28.654297 L 63 28 L 54 20.742188 L 54 8 L 45 8 L 45 13.484375 L 32 3 z M 32 13 L 8 32 L 8 56 L 56 56 L 56 35 L 32 13 z M 26 34 L 38 34 L 38 52 L 26 52 L 26 34 z"></path></svg></a><span class="bread-crumb-sep">»</span>${breadcrumbTail}`;
  const subtitle = count === 0 ? 'No games in this category yet.' : (count === 1 ? '1 game' : `${count} games`) + ' in this category';
  const emptyHtml = count === 0 ? '<p class="category-empty-msg">No games in this category yet. Check back later or try another category.</p>' : '';
  const popularHeading = `What are the most popular ${aboutTitle}`;
  const gameNamesListHtml = displayGames.slice(0, 10).map((g) => `<li><a href="/${g.slug}/">${escapeHtml(g.name)}</a></li>`).join('\n\t\t\t\t\t\t');
  const others = FIXED_CATEGORIES.filter((c) => c.slug !== slug);
  const hash = (s) => [...s].reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0);
  const four = [...others].sort((a, b) => hash(slug + a.slug) - hash(slug + b.slug)).slice(0, 4);
  const otherCateLinks = four.map(
    (c) => `<a class="us-sticker game-cate-link" href="/${c.slug}.games/">${escapeHtml(c.name)}</a>`
  ).join('');

  const aboutBody = CATEGORY_ABOUT_BODY[slug] != null
    ? CATEGORY_ABOUT_BODY[slug].trim()
    : `<p class="category-about-desc">${desc}</p>
									<h3 class="category-popular-heading">${escapeHtml(popularHeading)}</h3>
									<ul class="category-game-names-list">${gameNamesListHtml}</ul>`;

  let paginationHtml = '';
  if (totalPages > 1) {
    const prev = page > 1 ? `<a class="category-pagination-link category-pagination-prev" href="${categoryUrl(slug, page - 1)}">« Prev</a>` : '';
    const next = page < totalPages ? `<a class="category-pagination-link category-pagination-next" href="${categoryUrl(slug, page + 1)}">Next »</a>` : '';
    const pages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === page) pages.push(`<span class="category-pagination-current">${p}</span>`);
      else pages.push(`<a class="category-pagination-link" href="${categoryUrl(slug, p)}">${p}</a>`);
    }
    paginationHtml = `<nav class="category-pagination" aria-label="Category pages">${prev}<span class="category-pagination-numbers">${pages.join('')}</span>${next}</nav>`;
  }

  let html = categoryTemplate
    .replace(/<!-- CATEGORY:BREADCRUMB -->/, breadcrumbHtml)
    .replace(/<!-- CATEGORY:TITLE -->/g, escapeHtml(aboutTitle))
    .replace(/<!-- CATEGORY:ABOUT_TITLE -->/g, escapeHtml(aboutTitle))
    .replace(/<!-- CATEGORY:SUBTITLE -->/, escapeHtml(subtitle))
    .replace('<!-- CATEGORY:ABOUT_BODY -->', aboutBody)
    .replace('<!-- CATEGORY:EMPTY -->', emptyHtml)
    .replace('<!-- CATEGORY:OTHER_CATE -->', otherCateLinks)
    .replace('<!-- CATEGORY:PAGINATION -->', paginationHtml);

  const listBlock = extractBetween(html, '<!-- CATEGORY:LIST_START -->', '<!-- CATEGORY:LIST_END -->');
  const cardTemplate = extractCardTemplate(listBlock);
  if (cardTemplate) {
    const cards = displayGames.map((g) => renderCard(cardTemplate, g)).join('\n\t\t\t\t\t\t');
    html = replaceBetween(html, '<!-- CATEGORY:LIST_START -->', '<!-- CATEGORY:LIST_END -->', cards);
  }
  return html;
}

function replaceCategoryLinks(html, categoryCanonicalSlugMap) {
  const map = categoryCanonicalSlugMap || new Map();
  return html
    .replace(/href="\/category\/more\/?"/g, 'href="/"')
    .replace(/href="\/category\/([^"/]+)\/?"/g, (_, slug) => {
      const raw = slugify(slug, 80);
      const canonical = map.get(raw) || raw;
      return `href="${categoryUrl(canonical)}"`;
    });
}

/** Normalize all game links from /games/<slug> to /<slug>/ (gameUrl). */
function replaceGameLinks(html) {
  return html
    .replace(/href="\/games\/([^"]+?)"/g, (_, slug) => `href="${gameUrl(slug)}"`)
    .replace(/data-href="https:[^"]*\/games\/([^"]+?)"/g, (_, slug) => `data-href="${SITE_URL}${gameUrl(slug)}"`);
}

const STATIC_PAGES = [
  { slug: 'about-us', title: 'About Us', file: 'about-us.html' },
  { slug: 'contact-us', title: 'Contact Us', file: 'contact-us.html' },
  { slug: 'dmca', title: 'DMCA', file: 'dmca.html' },
  { slug: 'privacy-policy', title: 'Privacy Policy', file: 'privacy-policy.html' },
  { slug: 'terms-of-service', title: 'Terms of Service', file: 'terms-of-service.html' },
];

function buildStaticPages(baseHtml, staticTemplate, contentDirStatic, baseUrl, categoryCanonicalSlugMap) {
  const baseUrlForStatic = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  const canonicalBase = baseUrlForStatic + '/';
  /** Meta description 100–160 chars, no keyword spam. */
  const staticDescs = {
    'about-us': 'Learn more about SnowRider-3D.org, an independent website providing browser-based entertainment for users in the United States.',
    'contact-us': 'Contact SnowRider-3D.org for general inquiries, feedback, or support. We are available via email for users in the United States.',
    'dmca': 'SnowRider-3D.org respects intellectual property rights and responds promptly to valid DMCA takedown requests.',
    'privacy-policy': 'This Privacy Policy explains how SnowRider-3D.org collects, uses, and protects user information in accordance with U.S. regulations.',
    'terms-of-service': 'Read the Terms of Service governing the use of SnowRider-3D.org, including user responsibilities and limitations of liability.',
  };
  for (const page of STATIC_PAGES) {
    const contentPath = path.join(contentDirStatic, page.file);
    let bodyContent = '';
    if (fs.existsSync(contentPath)) {
      bodyContent = fs.readFileSync(contentPath, 'utf8').trim();
    } else {
      bodyContent = `<h1 class="home-title">${escapeHtml(page.title)}</h1><p>Content for ${escapeHtml(page.title)}.</p>`;
    }
    let content = staticTemplate
      .replace('<!-- STATIC:TITLE -->', '')
      .replace('<!-- STATIC:CONTENT -->', bodyContent);

    let fullHtml = buildPage(baseHtml, content, 'static');
    const title = staticMetaTitle(page.title, SITE_NAME);
    const desc = truncateDesc(staticDescs[page.slug] || `${page.title} - ${SITE_NAME}.`, 160);
    const pageCanonical = canonicalBase + page.slug + '/';
    fullHtml = injectMetaAndOG(fullHtml, {
      title,
      desc,
      canonical: `/${page.slug}/`,
      baseUrl: baseUrlForStatic,
      image: baseUrlForStatic + '/data/image/logo-snow-rider-3d.png',
    });
    fullHtml = fullHtml.replace(/<meta name="keywords"[^>]*>\s*/gi, '');
    const schema = staticPageSchema(page.title, pageCanonical, SITE_NAME, canonicalBase);
    fullHtml = injectJsonLd(fullHtml, `<script type="application/ld+json">\n${JSON.stringify(schema)}\n\t</script>`);
    fullHtml = replaceCategoryLinks(fullHtml, categoryCanonicalSlugMap);
    fullHtml = replaceGameLinks(fullHtml);
    writeDist(`${page.slug}/index.html`, fullHtml);
  }
}

function build404Page(baseHtml, notFoundContent, games, categoryCanonicalSlugMap) {
  let content = notFoundContent;
  const hasHotCat = (g) => (g.categories || []).some((c) => /hot/i.test(String(c.slug ?? c.name ?? '')));
  const hotGames = games.filter(hasHotCat).sort((a, b) => (b.playsPerMonth || 0) - (a.playsPerMonth || 0)).slice(0, 8);
  if (content.includes('<!-- 404:HOT_GAMES_START -->') && content.includes('<!-- 404:HOT_GAMES_END -->')) {
    const block = extractBetween(content, '<!-- 404:HOT_GAMES_START -->', '<!-- 404:HOT_GAMES_END -->');
    const cardTemplate = extractCardTemplate(block);
    if (cardTemplate) {
      const cards = hotGames.map((g) => renderCard(cardTemplate, g)).join('\n\t\t\t\t\t');
      content = replaceBetween(content, '<!-- 404:HOT_GAMES_START -->', '<!-- 404:HOT_GAMES_END -->', cards);
    }
  }
  let fullHtml = buildPage(baseHtml, content, '404');
  const desc404 = "Page not found. Return to the homepage or use search to find the game you're looking for.";
  fullHtml = fullHtml.replace(/<title>[^<]*<\/title>/, '<title>Page Not Found | Snow Rider 3D</title>');
  fullHtml = fullHtml.replace(/<meta name="title" content="[^"]*">\s*/gi, '');
  fullHtml = fullHtml.replace(/<meta name="description"[\s\S]*?content="[^"]*">/, `<meta name="description" content="${escapeHtml(desc404)}">`);
  fullHtml = fullHtml.replace(/<meta property="og:description"[\s\S]*?content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(desc404)}">`);
  fullHtml = fullHtml.replace(/<meta property="twitter:description"[\s\S]*?content="[^"]*">/, `<meta property="twitter:description" content="${escapeHtml(desc404)}">`);
  fullHtml = fullHtml.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Page Not Found | Snow Rider 3D">');
  fullHtml = fullHtml.replace(/<meta property="twitter:title" content="[^"]*">/, '<meta property="twitter:title" content="Page Not Found | Snow Rider 3D">');
  fullHtml = fullHtml.replace(/<meta name="robots" content="[^"]*">/g, '<meta name="robots" content="noindex,follow">');
  if (!fullHtml.includes('noindex,follow')) {
    fullHtml = fullHtml.replace('</head>', '\t<meta name="robots" content="noindex,follow">\n</head>');
  }
  fullHtml = fullHtml.replace(/<meta name="keywords"[^>]*>\s*/gi, '');
  fullHtml = fullHtml.replace(/<link rel="canonical" href="[^"]*">\s*/g, '');
  fullHtml = fullHtml.replace(/<meta property="og:url" content="[^"]*">\s*/gi, '');
  fullHtml = fullHtml.replace(/<meta property="twitter:url" content="[^"]*">\s*/gi, '');
  fullHtml = fullHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
  fullHtml = replaceCategoryLinks(fullHtml, categoryCanonicalSlugMap);
  fullHtml = replaceGameLinks(fullHtml);
  writeDist('404.html', fullHtml);
}

const PAGE_CSS_MAP = {
  home: 'home.css',
  game: 'game.css',
  category: 'category.css',
  static: 'static.css',
  search: 'search.css',
  '404': '404.css',
};

function pageCssLink(pageType) {
  const file = PAGE_CSS_MAP[pageType] || 'static.css';
  return `\t<link rel="stylesheet" type="text/css" href="/data/css/pages/${file}">`;
}

function buildPage(baseHtml, contentHtml, pageType) {
  let out = baseHtml
    .replace('<!-- SLOT:CONTENT -->', contentHtml)
    .replace('<!-- SLOT:PAGE_CSS -->', pageCssLink(pageType));
  return out;
}

function writeDist(filePath, html) {
  const full = path.join(distDir, filePath);
  const dir = path.dirname(full);
  if (dir !== '.') fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, html, 'utf8');
}

/**
 * Sitemap: home, all games, all categories, static pages. Excludes /search/ and 404.html.
 * If baseUrl empty => relative loc (e.g. "/", "/slug/"); else absolute.
 */
function buildSitemap(baseUrl, games, categoriesMap, buildDate) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : '';
  const loc = (path) => (base ? `${base}${path}` : path);
  const urls = [];

  urls.push({ loc: loc('/'), lastmod: buildDate });

  for (const game of games) {
    const slug = game.slug;
    if (!slug) continue;
    if (slug === HOME_GAME_SLUG) continue; /* /snow-rider-3d redirects to /, canonical is home */
    const lastmod = (game.updatedAt && game.updatedAt.slice(0, 10)) || buildDate;
    urls.push({ loc: loc(`/${slug}`), lastmod });
  }

  for (const [slug] of categoriesMap) {
    const pathName = categoryPagePath(slug);
    urls.push({ loc: loc(`/${pathName}/`), lastmod: buildDate });
  }

  for (const page of STATIC_PAGES) {
    urls.push({ loc: loc(`/${page.slug}/`), lastmod: buildDate });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`;
  writeDist('sitemap.xml', xml);
}

/**
 * robots.txt: Allow /; block build/source dirs; Sitemap canonical (https://snowrider-3d.org).
 */
function buildRobots(baseUrl) {
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : '';
  const sitemapUrl = base ? `${base}/sitemap.xml` : 'https://snowrider-3d.org/sitemap.xml';
  const body = `User-agent: *
Allow: /
Disallow: /dist/
Disallow: /scripts/
Disallow: /templates/
Disallow: /docs/
Disallow: /content/
Sitemap: ${sitemapUrl}
`;
  writeDist('robots.txt', body);
}

function buildSearchPage(baseHtml, searchTemplate, baseUrl, categoryCanonicalSlugMap) {
  const content = searchTemplate;
  let fullHtml = buildPage(baseHtml, content, 'search');
  const title = `Search | ${SITE_NAME}`;
  const base = baseUrl != null && baseUrl !== '' ? String(baseUrl).replace(/\/$/, '') : SITE_URL.replace(/\/$/, '');
  const searchUrl = base + '/search/';
  const descSearch = `Search ${SITE_NAME} for free online games. Find your favorite games by name, category, or keyword.`;
  fullHtml = injectMetaAndOG(fullHtml, { title, desc: descSearch, canonical: '/search/', baseUrl: base });
  fullHtml = fullHtml.replace(/<meta name="keywords"[^>]*>\s*/gi, '');
  const schemaSearch = staticPageSchema('Search', searchUrl, SITE_NAME, base + '/');
  fullHtml = injectJsonLd(fullHtml, `<script type="application/ld+json">\n${JSON.stringify(schemaSearch)}\n\t</script>`);
  fullHtml = fullHtml.replace(/<meta name="robots" content="[^"]*">/g, '<meta name="robots" content="noindex,follow">');
  if (!fullHtml.includes('noindex,follow')) {
    fullHtml = fullHtml.replace('</head>', '\t<meta name="robots" content="noindex,follow">\n</head>');
  }
  fullHtml = replaceCategoryLinks(fullHtml, categoryCanonicalSlugMap);
  fullHtml = replaceGameLinks(fullHtml);
  writeDist('search/index.html', fullHtml);
}

// --- main
fs.mkdirSync(distDir, { recursive: true });
const distGames = path.join(distDir, 'games');
const distCategory = path.join(distDir, 'category');
if (fs.existsSync(distGames)) fs.rmSync(distGames, { recursive: true });
if (fs.existsSync(distCategory)) fs.rmSync(distCategory, { recursive: true });

// Data file: default content/games.json. Override with DATA_FILE for test (e.g. DATA_FILE=content/games.sample.json npm run build)
const dataFile = process.env.DATA_FILE || 'content/games.json';
const gamesPath = path.resolve(root, dataFile);

let games = [];
try {
  if (fs.existsSync(gamesPath)) {
    games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    console.log(`Loaded ${games.length} game(s) from ${dataFile}`);
  } else {
    console.warn(`Data file not found: ${gamesPath}`);
  }
} catch (e) {
  console.warn('Could not load games data:', e.message);
}

const PLACEHOLDER_IMAGE_PATH = '/upload/placeholder.png';
function ensurePlaceholderImage() {
  const uploadDir = path.join(root, 'upload');
  const placeholderPath = path.join(uploadDir, 'placeholder.png');
  if (fs.existsSync(placeholderPath)) return;
  const minimalPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(placeholderPath, minimalPng);
  console.warn('Created upload/placeholder.png (1x1) for missing game images.');
}

/**
 * Validate and fix games: name required (fail build if missing), slug/image/description/categories fallbacks.
 * Logs warnings; only throws when name is missing.
 */
function validateGames(games) {
  if (!Array.isArray(games)) return;
  ensurePlaceholderImage();
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const name = game.name != null ? String(game.name).trim() : '';
    if (!name) {
      throw new Error(`Game at index ${i} has no name. Each game must have a "name" field.`);
    }
    if (!game.slug || !String(game.slug).trim()) {
      game.slug = slugify(game.name, 80);
      console.warn(`[validate] Game "${name}": missing slug, set to "${game.slug}"`);
    }
    if (!game.image || !String(game.image).trim()) {
      game.image = PLACEHOLDER_IMAGE_PATH;
      console.warn(`[validate] Game "${name}": missing image, using ${PLACEHOLDER_IMAGE_PATH}`);
    } else if (game.image.startsWith('/upload/')) {
      const file = game.image.replace(/^\/upload\/?/, '').split('?')[0];
      const inUpload = fs.existsSync(path.join(root, 'upload', file));
      const atRoot = fs.existsSync(path.join(root, path.basename(file)));
      if (!inUpload && !atRoot) {
        game.image = PLACEHOLDER_IMAGE_PATH;
        console.warn(`[validate] Game "${name}": image /upload/${file} not found, using ${PLACEHOLDER_IMAGE_PATH}`);
      }
    } else if (game.image.startsWith('/') && !game.image.startsWith('http')) {
      const file = game.image.replace(/^\//, '').split('?')[0];
      if (file && !fs.existsSync(path.join(root, file))) {
        game.image = PLACEHOLDER_IMAGE_PATH;
        console.warn(`[validate] Game "${name}": image /${file} not found, using ${PLACEHOLDER_IMAGE_PATH}`);
      }
    }
    if (!game.description || !String(game.description).trim()) {
      game.description = `Play ${game.name} online for free.`;
      console.warn(`[validate] Game "${name}": missing description, using fallback`);
    }
    if (!Array.isArray(game.categories) || game.categories.length === 0) {
      game.categories = [{ name: 'Other', slug: 'other' }];
      game.categoryMain = { name: 'Other', slug: 'other' };
      console.warn(`[validate] Game "${name}": missing categories, set to Other`);
    } else if (!game.categoryMain || !game.categoryMain.slug) {
      game.categoryMain = game.categories[0];
    }
  }
}

validateGames(games);

// Normalize game slugs: slugify, avoid reserved, dedupe
const usedGameSlugs = new Set();
const gameSlugChanges = [];
for (const game of games) {
  const originalSlug = game.slug;
  const input = (originalSlug && !isSlugDirty(originalSlug)) ? originalSlug.trim() : (game.name || 'game');
  const slug = normalizeAndValidateSlug(input, usedGameSlugs, RESERVED_SLUGS, '-game', 80);
  if (originalSlug && originalSlug !== slug) {
    gameSlugChanges.push({ type: 'game', old: originalSlug, new: slug, name: game.name });
  }
  game.slug = slug;
}

const { categoriesMap, categoryCanonicalSlugMap, categorySlugChanges } = deriveCategoriesMap(games);

// Remove stale game/category folders (when building to root, do not remove source dirs)
const gameSlugsSet = new Set(games.map((g) => g.slug));
const categoryPathsSet = new Set([...categoriesMap.keys()].map((slug) => `${slug}.games`));
const rootKeepDirs = new Set(['templates', 'content', 'scripts', 'docs', '.cursor', '.git', 'node_modules']);
const outputKeepDirs = ['search', 'about-us', 'contact-us', 'dmca', 'privacy-policy', 'terms-of-service', 'data', 'themes', 'upload', 'play'];
if (fs.existsSync(distDir)) {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    if (distDir === root && rootKeepDirs.has(name)) continue;
    if (name.endsWith('.games')) {
      if (!categoryPathsSet.has(name)) fs.rmSync(path.join(distDir, name), { recursive: true });
    } else if (!outputKeepDirs.includes(name)) {
      if (!gameSlugsSet.has(name)) fs.rmSync(path.join(distDir, name), { recursive: true });
    }
  }
}

const baseHtml = fs.readFileSync(path.join(layoutsDir, 'base.html'), 'utf8');
let homeContent = fs.readFileSync(path.join(pagesDir, 'home.html'), 'utf8');
homeContent = buildHomeWithGames(homeContent, games);
const gameContent = fs.readFileSync(path.join(pagesDir, 'game.html'), 'utf8');
const categoryContent = fs.readFileSync(path.join(pagesDir, 'category.html'), 'utf8');
const staticTemplate = fs.readFileSync(path.join(pagesDir, 'static.html'), 'utf8');
const notFoundContent = fs.readFileSync(path.join(pagesDir, '404.html'), 'utf8');
const searchTemplate = fs.readFileSync(path.join(pagesDir, 'search.html'), 'utf8');

// Home
const baseUrl = getBaseUrl();
let homeFull = buildPage(baseHtml, homeContent, 'home');
const HOME_OG_IMAGE = '/data/image/snow-rider-3d-og-image.png';
const homeTitle = 'Snow Rider 3D – Sled Down the Slopes & Dodge Obstacles';
const homeDesc = 'Steer your sled down snowy hills, dodge obstacles, and collect items. Snow Rider 3D brings fast winter racing to your browser.';
const baseUrlForHome = baseUrl || SITE_URL;
homeFull = injectMetaAndOG(homeFull, { title: homeTitle, desc: truncateDesc(homeDesc, 160), canonical: '/', image: HOME_OG_IMAGE, baseUrl: baseUrlForHome });
homeFull = injectJsonLd(homeFull, `<script type="application/ld+json">\n${JSON.stringify(homeSchemaGraph(baseUrlForHome))}\n\t</script>`);
homeFull = replaceCategoryLinks(homeFull, categoryCanonicalSlugMap);
homeFull = replaceGameLinks(homeFull);
const homeCanonicalFull = baseUrlForHome.replace(/\/$/, '') + '/';
homeFull = homeFull.replace(/__HOME_CANONICAL_URL__/g, homeCanonicalFull);
writeDist('index.html', homeFull);

// 404 (root dist/404.html for GitHub Pages)
build404Page(baseHtml, notFoundContent, games, categoryCanonicalSlugMap);

// Search page: dist/search/index.html (noindex,follow)
buildSearchPage(baseHtml, searchTemplate, baseUrl, categoryCanonicalSlugMap);

// Write games.json with normalized slugs for client-side search
fs.writeFileSync(path.join(distDir, 'games.json'), JSON.stringify(games, null, 0), 'utf8');

// Static pages: about-us, contact-us, dmca, privacy-policy, terms-of-service
buildStaticPages(baseHtml, staticTemplate, contentDirStatic, baseUrl, categoryCanonicalSlugMap);

// Category pages: dist/<categorySlug>.games/index.html
buildCategoryPages(baseHtml, categoryContent, categoriesMap, baseUrl, categoryCanonicalSlugMap);

// Game pages: one per game in games.json
buildGamePages(baseHtml, gameContent, games, baseUrl, categoryCanonicalSlugMap);
const buildDate = new Date().toISOString().slice(0, 10);
// Sitemap/robots need absolute URLs for Google; use SITE_URL if no CNAME
const baseUrlForSitemap = baseUrl || SITE_URL;
buildSitemap(baseUrlForSitemap, games, categoriesMap, buildDate);
buildRobots(baseUrlForSitemap);

// If game.image is /upload/<file> but file is at repo root, copy to upload/ so dist has it
function ensureGameImagesInUpload(games) {
  if (!Array.isArray(games)) return;
  const uploadDir = path.join(root, 'upload');
  fs.mkdirSync(uploadDir, { recursive: true });
  for (const game of games) {
    const img = game.image;
    if (!img || typeof img !== 'string' || !img.startsWith('/upload/')) continue;
    const file = img.replace(/^\/upload\/?/, '').replace(/\?.*$/, '');
    const uploadPath = path.join(uploadDir, file);
    if (fs.existsSync(uploadPath)) continue;
    const rootPath = path.join(root, path.basename(file));
    if (fs.existsSync(rootPath)) {
      fs.copyFileSync(rootPath, uploadPath);
    }
  }
}
ensureGameImagesInUpload(games);

// Copy asset folders to output (skip when building to root — already at root)
function copyDistAssets() {
  if (distDir === root) return;
  const dirs = ['themes', 'data', 'upload', 'play'];
  for (const dir of dirs) {
    const src = path.join(root, dir);
    const dest = path.join(distDir, dir);
    if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }
  // Copy favicon and root assets to dist
  const rootAssets = ['favicon-96x96.png', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest', 'web-app-manifest-192x192.png', 'web-app-manifest-512x512.png', 'snow-rider-3d.png', 'browserconfig.xml'];
  for (const name of rootAssets) {
    const src = path.join(root, name);
    const dest = path.join(distDir, name);
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}
copyDistAssets();

// Ensure OG image exists in dist (meta og:image points to /data/image/snow-rider-3d-og-image.png)
const distOgImage = path.join(distDir, 'data', 'image', 'snow-rider-3d-og-image.png');
if (!fs.existsSync(distOgImage)) {
  const fallback = path.join(distDir, 'data', 'image', 'logo-snow-rider-3d.png');
  if (fs.existsSync(fallback)) {
    fs.copyFileSync(fallback, distOgImage);
    console.warn('Created data/image/snow-rider-3d-og-image.png from logo (add a 1200x630 image for better shares).');
  }
}

// Template hygiene: fail if templates contain legacy /games/ or /tag/
function checkTemplatesNoOldUrls() {
  const bad = [];
  const walk = (dir, base = '') => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, rel);
      else if (e.name.endsWith('.html')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/\/games\//.test(text) || /\/tag\//.test(text)) {
          bad.push(path.relative(root, full));
        }
      }
    }
  };
  walk(templatesDir);
  if (bad.length) {
    console.error('ERROR: templates contain forbidden URLs (/games/ or /tag/):');
    bad.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
}
// Internal link hygiene: fail if dist still contains old URL patterns
function checkDistNoOldUrls() {
  const bad = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.html')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/href="\/games\//.test(text) || /href="\/tag\//.test(text) || /"\/games\//.test(text) || /"\/tag\//.test(text)) {
          bad.push(path.relative(distDir, full));
        }
      }
    }
  };
  walk(distDir);
  if (bad.length) {
    console.error('ERROR: dist contains forbidden URLs (/games/ or /tag/):');
    bad.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
}
checkDistNoOldUrls();

// Home UI audit: dist/index.html must not contain game-detail content ("About <game name>")
function checkDistHomeNoGameDetail() {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const html = fs.readFileSync(indexPath, 'utf8');
  if (/<h2[^>]*>\s*About\s+[^<]+<\/h2>/i.test(html)) {
    console.error('[FAIL] dist/index.html contains game detail (About <game name>). Home must only have home sections.');
    process.exit(1);
  }
}

// Scan dist HTML: any src="/upload/..." must have file in dist/upload/
function checkDistUploadRefs() {
  const bad = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.html')) {
        const text = fs.readFileSync(full, 'utf8');
        const matches = text.match(/src="\/upload\/([^"]+)"/g) || [];
        for (const m of matches) {
          const filePath = m.replace(/src="\/upload\//, '').replace(/"$/, '');
          const distFile = path.join(distDir, 'upload', filePath.replace(/\//g, path.sep));
          if (!fs.existsSync(distFile)) {
            bad.push(`${path.relative(distDir, full)}: /upload/${filePath} not found`);
          }
        }
      }
    }
  };
  walk(distDir);
  if (bad.length) {
    bad.forEach((f) => console.error('[FAIL] ' + f));
    console.error('\nFix: ensure game image paths in content/games.json point to files in upload/ and build copies upload/ to dist/.');
    process.exit(1);
  }
}

checkDistHomeNoGameDetail();
checkDistUploadRefs();

// Full audit: data, HTML, links, alt, sitemap — fail build on any [FAIL]
const { fails: auditFails, warns: auditWarns } = runAudit(distDir, games, root, categoriesMap);
if (auditWarns.length) {
  auditWarns.forEach((w) => console.warn(w));
}
if (auditFails.length) {
  auditFails.forEach((f) => console.error(f));
  console.error('\nAudit failed. Fix the above and rebuild.');
  process.exit(1);
}

// Log slug changes (old -> new)
if (gameSlugChanges.length || categorySlugChanges.length) {
  console.warn('\nSlug changes (old -> new):');
  for (const { type, old, new: n, name } of gameSlugChanges) {
    console.warn(`  [game] ${old} -> ${n}${name ? ` (${name})` : ''}`);
  }
  for (const { type, old, new: n, name } of categorySlugChanges) {
    console.warn(`  [category] ${old} -> ${n}${name ? ` (${name})` : ''}`);
  }
}

if (distDir === root) {
  const oldDist = path.join(root, 'dist');
  if (fs.existsSync(oldDist)) fs.rmSync(oldDist, { recursive: true });
}
console.log('\nBuild done. Output at ' + (distDir === root ? 'repo root' : 'dist/'));
console.log('  index.html, 404.html, robots.txt, sitemap.xml, games.json');
console.log('  search/, about-us/, contact-us/, dmca/, privacy-policy/, terms-of-service/');
console.log('  <categorySlug>.games/, <gameSlug>/');
