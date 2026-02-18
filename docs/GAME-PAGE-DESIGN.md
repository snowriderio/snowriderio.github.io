# Game page design summary

Applies to **all** game subpages (slope, cookie-clicker, snow-rider-3d, vex-8, ...).  
CSS: `data/css/pages/game.css`. Strip/sidebar logic: `data/js/sidebar-games.js`.

---

## 1. Design system (CSS variables)

| Variable | Value | Use |
|----------|-------|-----|
| `--game-bg-from` | #aeefff | Gradient background (top) |
| `--game-bg-mid` | #4dd4f7 | Gradient middle |
| `--game-bg-to` | #1a8fc9 | Gradient bottom, strip card background |
| `--game-card-bg` | #0b4fa3 | About / breadcrumb card background |
| `--game-card-shadow` | … | Card shadow, hover shadow |
| `--game-accent` | #fccc00 | About title, accent buttons |
| `--game-accent-cat` | #e8a84a | Category link, tag |
| `--game-radius` | 12px | Card and iframe border radius |
| `--game-radius-card` | 24px | About card border radius |
| `--game-spacing` | 1rem | General spacing |

---

## 2. Overall layout

- **Wrapper** `#game-page`: blue gradient, no horizontal overflow (`overflow-x: hidden`), compact padding.
- **Container / row**: `max-width: 100%`, `overflow-x: hidden`, `box-sizing: border-box`.
- **Main column**: `.game-middle.box-frame` — iframe + game header + strip + About card.
- **Two sidebars**: left **Hot games** (230px), right **New games** (300px); shrink at breakpoints (1280px, 1100px, 992px).

---

## 3. Game header (info bar)

- Thumbnail 44×44, border radius `--game-radius`, faint white border.
- Game name: `font-size: 1.2rem`, white, bold.
- Like / report / reload / fullscreen buttons: dark background, darker on hover.
- Compact margin/padding (`margin-top: 0.15rem`, …).

---

## 4. Game play area (iframe)

- Iframe block is always present (build always outputs iframe block).
- `.game-flow--iframe`: `min-height: 440px`, 12px radius, light dark background.
- `.iframe-default`: `height: 560px`, `max-height: 78vh`, `min-height: 440px`, 12px radius.

---

## 5. "More games" strip (below iframe)

**Position:** Directly below game header, above About card (breadcrumb + description).

**Data source:** Only games in category **snow-rider.games** (with name fallback), sorted **newest first** (`updatedAt`). Logic in `sidebar-games.js` (`fillStripFromApi`, `isSnowRiderCategory`).

**Layout & interaction:**

- **Scroller** `.box-show-category`:
  - `display: flex`, `flex-wrap: nowrap`, `gap: 10px`.
  - `padding: 10px` (avoid clipping first card), `margin: 0` (override theme `margin: -4px`).
  - `overflow-x: auto`, `overflow-y: visible` (hover not clipped), scrollbar hidden.
  - Override theme: `aspect-ratio: unset`, `grid-template-*: unset`.

- **Game card** `.us-grid-game`:
  - Square 1:1: `width: calc((100% - 60px) / 7)`, `aspect-ratio: 1/1`.
  - Desktop: **7 cards** fit viewport; >7 games then horizontal scroll (mouse / trackpad).
  - 12px radius, `isolation: isolate`, hover `z-index: 2`.

- **Hover:**
  - Card: `translateY(-4px)`, stronger `box-shadow`.
  - Image: `scale(1.05)`.
  - Game name: shown at **bottom-center**, white **16px** text, bold, dark gradient overlay, fade + slide (`translateY(6px)` → `0`).

- **Do not show** badge/ribbon (Trending, Hot, New) in strip — hide all `.GameThumbLabel*`.

**Spacing:**

- Strip: `padding-bottom: 0.5rem`, `margin-top: 0.5rem`.
- About card directly below: `margin-top: 0.75rem` (close to strip).

---

## 6. About card (breadcrumb + description)

- Class: `.us-content.game-flow-b`.
- Background `--game-card-bg`, radius `--game-radius-card`, shadow `--game-card-shadow`, white text.
- `padding: 1.25rem 1.5rem`, `margin-top: 0.75rem`, `clear: both`.
- Breadcrumb: category link color `--game-accent-cat`, white separator.
- About title: color `--game-accent`, `font-size: 1.5rem`.
- Comments section: border-top, accent title.

---

## 7. Left sidebar (Hot games)

- Width 230px (1280px: 200px; 1100px: 180px; 992px: 100%).
- 2-column grid, `gap: 8px`, square images `aspect-ratio: 1/1`, radius `--game-radius`.
- Data: Hot/Trending games from `games.json`, newest first; label priority Hot > Trending > New (labels still shown in sidebar).

---

## 8. Right sidebar (New games)

- Width 300px (1280px: 240px; 1100px: 220px; 992px: 100%).
- 3-column grid, `gap: 8px`, square 1:1 images, radius `--game-radius`.
- Data: all games from `games.json`, newest first (excluding current game).

---

## 9. Sidebar titles (Hot games / New games)

- `border-bottom: 2px solid #000`, `padding-bottom: 10px`.
- `h2`: `color: #0b2a44`, `font-size: 1.4rem`, bold.

---

## 10. Theme overrides (strip)

In `game.css`, the strip **overrides** theme (`themes/snowrider3dd/rs/css/all.css`):

- `.box-show-category`: remove `margin: -4px`, `overflow: hidden`, `display: grid`, `aspect-ratio`, `grid-template-*` (use flex + padding + overflow-y: visible).
- `.us-grid-game` in strip: `padding-bottom: 0 !important` (theme uses `padding-bottom: 100%`).
- `.game-middle.box-frame`: `overflow: visible` so strip hover is not clipped.

---

## 11. Key files

| File | Main content |
|------|--------------|
| `data/css/pages/game.css` | All game page styles (design system, layout, strip, sidebar, About, responsive). |
| `data/js/sidebar-games.js` | Load `games.json`, fill Hot/New sidebar, fill snow-rider.games strip, sort newest first, strip mouse scroll (>7 games). |
| `scripts/build.mjs` | Build HTML from template + content; copy CSS/JS to output. |

After editing, run **`npm run build`** to update the built site.
