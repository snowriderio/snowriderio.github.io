# Guide: Adding a game (on GitHub)

When you add or edit a game **directly on GitHub** (or push from your machine), the site **builds automatically** via GitHub Actions and updates the homepage and game pages within a few minutes.

---

## 1. Add a game on GitHub (web)

1. Go to the repo and open **`content/games.json`**.
2. Click **Edit** (pencil icon).
3. Add a new game block to the `[...]` array, using the format below.
4. Click **Commit changes** (you can edit the commit message) and then **Commit changes**.

**Example** — add a game at the end of the array (before the closing `]`):

```json
,
{
  "name": "Your game name",
  "slug": "your-game-slug",
  "image": "/upload/your-image.webp",
  "description": "Short description for SEO, 1–2 sentences.",
  "categories": [
    { "name": "Hot Games", "slug": "hot-games" },
    { "name": "Sports", "slug": "sports" }
  ],
  "categoryMain": { "name": "Sports", "slug": "sports" },
  "iframeUrl": "https://example.com/embed/",
  "ratingValue": 4.5,
  "ratingCount": 100,
  "updatedAt": "2026-02-04"
}
```

**Notes:**

- **slug**: Lowercase, hyphens, no spaces (e.g. `snow-rider-3d`).
- **image**: Image path. If the image is in the repo: upload to **`upload/`** and use `/upload/filename.webp`.
- **categories**: Use existing categories (Hot Games, Trending Games, Snow Rider Games, Clicker, Io, Adventure, 2 player, Shooting, Sports, Car, Puzzle, Casual, Kids). **categoryMain** usually matches one of **categories**.
- **iframeUrl**: URL of the page that embeds the game (playable in iframe).
- **updatedAt**: Update date (YYYY-MM-DD). Newest games appear first in “New games” on the homepage.

---

## 2. Add an image for the game

- Option 1: Go to **`upload/`** → **Add file** → **Upload files** → choose the image (prefer .webp).
- Option 2: Drag and drop the file onto the `upload/` folder page on GitHub.
- In `games.json`, use: `"image": "/upload/filename.webp"`.

---

## 3. After committing

1. Open the **Actions** tab of the repo.
2. Workflow **“Build site”** will run (a few minutes).
3. When it finishes, it **commits and pushes** the built files (index.html, new game page, sitemap, etc.).
4. GitHub Pages (snowrider-3d.org) will serve the new version so the new game appears on the homepage and has its own page `https://snowrider-3d.org/your-game-slug/`.

**Bot commit** message is like: `Build: update static site [skip ci]` to avoid infinite build loops.

---

## 4. Edit or remove a game

- **Edit:** Edit the corresponding game object in `content/games.json` and commit. After Actions runs, the game page and homepage will update.
- **Remove:** Delete the entire `{ ... }` block for that game in `content/games.json` (and fix any trailing comma), then commit. The next build will drop that game and it will disappear from the homepage.

---

## 5. Build on your machine (optional)

If you clone the repo and edit locally:

```powershell
cd "path-to-repo"
npm install
npm run build
git add -A
git reset -- node_modules/
git commit -m "Add game XYZ"
git push
```

Pushing to `main` will still trigger the workflow; the workflow will build again and commit the new build if there are changes.
