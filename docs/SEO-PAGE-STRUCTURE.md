# Page structure & SEO indexing

Summary of page types, sample URLs, and index/noindex directives for search engines.

| Page type | Sample URL | Trailing / | Indexing |
|-----------|------------|------------|----------|
| **Homepage** | `/` | yes | `index` |
| **Category** | `/<slug>.games/` (e.g. `/racing.games/`, `/snow-rider.games/`) | yes | `index` |
| **Game page** | `/<slug>` (e.g. `/snow-rider-3d`) | yes | `index` |
| **Static pages** | `/privacy-policy/`, `/about-us/`, `/contact-us/`, `/dmca/`, `/terms-of-service/` | yes | `index` |
| **404** | `/404.html` | yes | `noindex` |
| **Sitemap** | `/sitemap.xml` | yes | (XML file, not indexed as content) |
| **Robots** | `/robots.txt` | yes | (crawler instructions, not indexed as content) |

---

## Notes

- **Homepage:** `index.html` at root; canonical `https://snowrider-3d.org/`; `index,follow`.
- **Category:** Each category has folder `/<slug>.games/` with `index.html`; canonical with trailing slash; `index,follow`.
- **Game page:** Each game has folder `/<slug>/` (e.g. `snow-rider-3d/index.html`); canonical URL without trailing slash (e.g. `https://snowrider-3d.org/snow-rider-3d`); `index,follow`.
- **Static pages:** about-us, contact-us, dmca, privacy-policy, terms-of-service; `index,follow`.
- **404:** Error page; meta `noindex,follow`; not included in sitemap.
- **Search:** `/search/` uses `noindex,follow` (internal search page).
- **Sitemap:** `sitemap.xml` lists URLs to index; does not include 404 or search.
- **Robots:** `robots.txt` allows `/`, blocks source folders (dist, scripts, templates, docs, content), declares `Sitemap: https://snowrider-3d.org/sitemap.xml`.

Last updated: per current build and repo structure.
