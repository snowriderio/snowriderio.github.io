# SEO & Deploy Checklist – Snow Rider 3D

Kiểm tra sẵn sàng up lên GitHub và tối ưu SEO từ khóa **Snow Rider 3D**.

---

## Đã đạt (Ready)

### 1. Technical SEO
- **Canonical URL:** Trang chủ và mọi trang game/category/static đều có `<link rel="canonical">` trỏ đúng `https://snowrider-3d.org/...`.
- **Sitemap:** `sitemap.xml` có đủ: home, 25 game, 13 category, all.games, about-us, contact-us, dmca, privacy-policy, terms-of-service. URL tuyệt đối, có `lastmod`.
- **robots.txt:** Cho phép index `/`, chặn thư mục nguồn (dist, scripts, templates, docs, content), có `Sitemap: https://snowrider-3d.org/sitemap.xml`.
- **CNAME:** `snowrider-3d.org` – GitHub Pages dùng đúng domain.

### 2. Từ khóa Snow Rider 3D
- **Trang chủ (index.html):**
  - Title: `Snow Rider 3D – Sled Down the Slopes & Dodge Obstacles`
  - Meta description: có "Snow Rider 3D", "winter racing", "browser"
  - Meta keywords: `Snow Rider 3D, sledding game, winter game, 3D racing, ...`
  - H1: "Snow Rider 3D" (trong header game)
  - H2: "Snow Rider 3D – Endless Snow Sledding Challenge"
  - Đoạn đầu nội dung: 2 câu đều có "Snow Rider 3D"
- **Trang game Snow Rider 3D (/snow-rider-3d):**
  - Title: `Snow Rider 3D – Play & Master the Run | Snow Rider 3D`
  - Meta description: đã cập nhật có "Play Snow Rider 3D", "winter sledding game", "browser"
  - Schema VideoGame + BreadcrumbList + WebPage
- **Branding:** Apple/OG/twitter/site_name đều dùng "Snow Rider 3D".

### 3. Schema (JSON-LD)
- **Home:** WebSite (có SearchAction), Organization, VideoGame cho Snow Rider 3D.
- **Trang game:** BreadcrumbList, WebPage, VideoGame (name, description, image, genre, aggregateRating, offers).
- **Category:** BreadcrumbList trên trang category.

### 4. Open Graph & Twitter
- Mọi trang có og:title, og:description, og:image, og:url, twitter:card, twitter:title, twitter:description, twitter:image.

### 5. Trải nghiệm & Code
- **Build:** `npm run build` chạy xong, audit (data, HTML, links, alt, sitemap) pass, không FAIL.
- **URL:** Game dạng `/slug` và `/slug/` (có `slug/index.html`), category dạng `/<slug>.games/`.
- **404:** Có trang 404, noindex, có link về trang chủ và search.
- **Mobile:** Viewport, responsive (home + game), bảng và khung game đã chỉnh.
- **Ảnh:** Game có alt (tên game), logo/icon có title/alt.

### 6. Nội dung
- Trang chủ: giới thiệu Snow Rider 3D, controls, technical overview, internal link tới Snow Rider Games, Hot, Sports.
- Trang game: mỗi game có description, about (nếu có file about), breadcrumb, category tags, related games.
- Category: mô tả category, list game, phân trang.

---

## Đã chỉnh trong lần kiểm tra này

- **Meta description game Snow Rider 3D** (content/games.json): Đổi thành câu có "Play Snow Rider 3D", "steer your sled", "winter sledding game", "browser" để tối ưu từ khóa và snippet.

---

## Gợi ý sau khi lên top (optional)

1. **Google Search Console:** Thêm property `snowrider-3d.org`, gửi sitemap `https://snowrider-3d.org/sitemap.xml`. Đã có thẻ `google-site-verification` trong HTML.
2. **Trùng nội dung (nếu cần):** Trang chủ và `/snow-rider-3d` cùng là game Snow Rider 3D. Nếu muốn chỉ đẩy 1 URL: có thể thêm canonical từ `/snow-rider-3d` về `/` hoặc noindex trang `/snow-rider-3d`. Hiện tại để cả hai index là hợp lý (home = portal, /snow-rider-3d = trang game riêng).
3. **Core Web Vitals:** Sau khi deploy, kiểm tra PageSpeed Insights / Search Console (CWV) và tối ưu LCP/CLS nếu cần.
4. **Backlink & content:** SEO lâu dài: backlink chất lượng, thêm bài/blog về Snow Rider 3D, cập nhật nội dung định kỳ.

---

## Kết luận

**Code và nội dung đã sẵn sàng để push lên GitHub và dùng cho SEO từ khóa Snow Rider 3D.**  

- Technical SEO, schema, OG, sitemap, robots, canonical đều ổn.  
- Từ khóa "Snow Rider 3D" đã có trên title, description, H1, H2 và đoạn đầu nội dung trang chủ + trang game.  
- Build và audit pass. Chỉ cần push repo, bật GitHub Pages (branch chứa output), trỏ domain `snowrider-3d.org` (CNAME đã có), sau đó gửi sitemap trong Search Console.
