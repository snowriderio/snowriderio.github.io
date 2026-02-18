# View the site on localhost

## Run the server

From the project root:

```bash
npm run serve
```

Server runs at **http://localhost:5501** (port 5501). If you see "address already in use", use another port: `set PORT=3000; npm run serve` (Windows) or use a different port.

**Note:** `npm run serve` serves from **repo root** if you have run the default build (output at root); if you have not built yet or build to `dist/`, it uses the `dist` folder. Visiting `/sports.games/` or `/snow-rider.games/` returns the corresponding `index.html`. If you see errors, run `npm run build` then `npm run serve` again.

---

## Homepage & category links (localhost)

- **Homepage:** http://localhost:5501/
- **Search:** http://localhost:5501/search/

### Category pages (format /name.games)

| Category        | URL localhost                    |
|-----------------|-----------------------------------|
| Hot Games       | http://localhost:5501/hot.games/ |
| Trending Games  | http://localhost:5501/trending.games/ |
| Snow Rider Games| http://localhost:5501/snow-rider.games/ |
| Clicker         | http://localhost:5501/clicker.games/ |
| Io              | http://localhost:5501/io.games/ |
| Adventure       | http://localhost:5501/adventure.games/ |
| 2 player        | http://localhost:5501/2-player.games/ |
| Shooting        | http://localhost:5501/shooting.games/ |
| Sports          | http://localhost:5501/sports.games/ |
| Car             | http://localhost:5501/car.games/ |
| Puzzle          | http://localhost:5501/puzzle.games/ |
| Casual          | http://localhost:5501/casual.games/ |
| Kids            | http://localhost:5501/kids.games/ |
| All Games       | http://localhost:5501/all.games/ |

### Static pages

- About: http://localhost:5501/about-us/
- Contact: http://localhost:5501/contact-us/
- DMCA: http://localhost:5501/dmca/
- Privacy: http://localhost:5501/privacy-policy/
- Terms: http://localhost:5501/terms-of-service/

---

On **GitHub Pages** (domain in CNAME: **snowrider-3d.org**) the same paths apply:  
`https://snowrider-3d.org/sports.games/`
