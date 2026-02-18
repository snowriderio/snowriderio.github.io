# How to run the site locally

The site is **only** rendered from the build. Source: `content/games.json` → `scripts/build.mjs` → output to **repo root** (default for GitHub Pages) or `dist/` if you set `PUBLISH_ROOT=0`.

## How to run

1. **Build** (from repo root):
   ```bash
   npm run build
   ```
   Default writes to repo root: `index.html`, `404.html`, `*.games/`, `<gameSlug>/`, etc.

2. **Open the site:**
   - Use **`npm run serve`** (see **LOCALHOST.md**) — server serves from root, port 5501.
   - Or open `index.html` at repo root in your browser (relative paths still work).

## Notes

- Game link: `/<slug>/` (e.g. `/snow-rider-3d/`), not `/games/<slug>/`.
- Deploy: this repo uses **GitHub Pages** from branch **main/master**, root; domain in **CNAME**. See **docs/GITHUB-PAGES-DOMAIN.md**.
