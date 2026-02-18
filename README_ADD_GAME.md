# How to add a new game

The site is built statically from `content/games.json`. **To add a game directly on GitHub:** edit `content/games.json` and upload images to `upload/`, then commit & push → GitHub Actions runs the build and updates the site (no need to run build from Cursor or your machine). Details: see **`docs/HUONG-DAN-THEM-GAME.md`**.

To add a game when working locally:

---

## Step 1: Add an object to `content/games.json`

Open `content/games.json` and add a new object to the array (use the correct format):

```json
{
  "name": "Game name",
  "slug": "game-url-slug",
  "image": "/upload/image-file.webp",
  "description": "Short 1–2 sentence description for SEO.",
  "categories": [
    { "name": "Hot Games", "slug": "hot-games" },
    { "name": "Runner", "slug": "runner" }
  ],
  "categoryMain": { "name": "Hot Games", "slug": "hot-games" },
  "ratingValue": 4.5,
  "ratingCount": 500,
  "playsPerMonth": 10000,
  "isNew": false,
  "isHot": true,
  "updatedAt": "2026-02-01",
  "iframeUrl": ""
}
```

**Notes:**

- **name** (required): Display name.
- **slug** (recommended): URL slug, only `a-z0-9-`. If empty, build will generate from `name`.
- **image** (required): Image path (e.g. `/upload/game-name.webp`). If missing, build uses a placeholder.
- **description**: If missing, build uses a default sentence.
- **categories**: At least one category. If missing, build assigns "Other".
- **categoryMain**: Main category (usually matches the first item in `categories`).
- **iframeUrl**: URL of the game iframe; use `""` or `null` if not available yet.

---

## Step 2: Add thumbnail image to `/upload/`

- Place the image file (e.g. `game-name.webp`) in **`upload/`** (same level as `content/`).
- In JSON use the path: `"/upload/game-name.webp"`.
- If you don't have an image yet, you can omit `image`; build will use `/upload/placeholder.png`.

---

## Step 3: Run build

```bash
npm run build
```

- Default build uses **`content/games.json`**.
- Quick test with 3 games:  
  `DATA_FILE=content/games.sample.json npm run build`

---

## Step 4: Commit and push

```bash
git add content/games.json upload/
git commit -m "Add game: Game name"
git push
```

After push, the **Build site** workflow (`.github/workflows/build.yml`) runs and commits the built files (index.html, game pages, sitemap...) with message `Build: update static site [skip ci]`. The site on GitHub Pages (domain in **CNAME**: `snowrider-3d.org`) will use the new version.

---

## Build validation

- **Missing name** → Build **fails** (required).
- Missing slug → Generated from `name`, warning logged.
- Missing image → Uses `/upload/placeholder.png`, warning logged.
- Missing description → Uses default sentence, warning logged.
- Missing/empty categories → Assigns "Other", warning logged.
- Duplicate slug → Build appends `-2`, `-3`, ... to keep slugs unique.

No tags; game URL is `/<slug>/`, category URL is `/<slug>.games/`.
