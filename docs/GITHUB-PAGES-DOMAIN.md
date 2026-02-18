# GitHub Pages + custom domain

The site is hosted on **GitHub Pages** and uses the domain **snowrider-3d.org**.

## GitHub-friendly structure

- **Build output** is written to the **repo root** (no `dist/` folder when deploying): `index.html`, `404.html`, `games.json`, `sitemap.xml`, `robots.txt`, `.nojekyll`, and folders such as `*.games/`, `<gameSlug>/`, `search/`, `about-us/`, etc.
- **CNAME** file at root contains the domain: `snowrider-3d.org` (no `https://`, no `www`).
- **.nojekyll** is created by the build at root so GitHub Pages does **not** run Jekyll and serves plain static HTML.

## GitHub configuration

1. **Settings → Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** (or **master** if the repo uses that branch)
   - Folder: **/ (root)**
   - Save

2. **Custom domain**
   - In Pages settings, under **Custom domain** enter: `snowrider-3d.org`
   - Enable **Enforce HTTPS** (after DNS is set up)

3. **DNS (at your domain registrar)**
   - **A records** pointing `snowrider-3d.org` to GitHub's IPs:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
   - Or **CNAME** (for a subdomain): e.g. `www` → `username.github.io` (for a repo named `username.github.io`, root CNAME can point to `username.github.io`).

After DNS propagates, GitHub will show "DNS check passed" and you can enable HTTPS.

## Adding games directly on the repo

- Edit **`content/games.json`** and add images to **`upload/`** on GitHub, then commit and push.
- The **Build site** workflow (`.github/workflows/build.yml`) runs, builds, and **auto-commits** the built files with message `Build: update static site [skip ci]`.
- You do not need to run `npm run build` from Cursor or locally when only adding/editing games on GitHub.

Details: **`docs/HUONG-DAN-THEM-GAME.md`** (guide in English).
