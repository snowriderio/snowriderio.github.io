/**
 * Sidebar: Hot games = game có cate Hot hoặc Trending (từ /games.json). New games = thứ tự mới nhất.
 * Strip dưới khung game: chỉ cate snow-rider, thứ tự mới nhất. Chỉ dùng dữ liệu từ /games.json.
 */
(function () {
	'use strict';

	var HOT_MAX = 20;
	var NEW_MAX = 24;
	var STRIP_VISIBLE = 7;
	var STRIP_SCROLL_SPEED = 0.2;
	var STRIP_SCROLL_INTERVAL = 45;

	/** Current game slug from URL. Strip .html so /snow-rider-2.html and /snow-rider-2 both yield "snow-rider-2". */
	function getCurrentSlug() {
		var path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
		path = path.replace(/^\//, '').replace(/\/$/, '');
		if (path && path.indexOf('.html') !== -1) path = path.replace(/\.html$/i, '');
		return path || '';
	}

	/** Game đăng/cập nhật trong 30 ngày = New. */
	function isWithinLast30Days(updatedAt) {
		if (!updatedAt) return false;
		var d = new Date(String(updatedAt).trim());
		if (isNaN(d.getTime())) return false;
		var now = new Date();
		var diff = now.getTime() - d.getTime();
		return diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
	}

	/** Ưu tiên tag: Hot > Trending > New. New = có cate New hoặc mới trong 30 ngày. */
	function getThumbLabel(g) {
		var cats = (g && g.categories) ? g.categories : [];
		var hasHot = cats.some(function (c) {
			var s = String((c && c.slug) || (c && c.name) || '').toLowerCase();
			return s.indexOf('hot') !== -1;
		});
		var hasTrending = cats.some(function (c) {
			var s = String((c && c.slug) || (c && c.name) || '').toLowerCase();
			return s.indexOf('trending') !== -1;
		});
		var hasNew = cats.some(function (c) {
			var slug = String((c && c.slug) || '').toLowerCase();
			var name = String((c && c.name) || '').toLowerCase();
			return slug === 'new' || name.indexOf('new games') !== -1 || name === 'new';
		});
		var newByDate = isWithinLast30Days(g && g.updatedAt);
		if (hasHot) return { class: 'GameThumbLabel_Hot', text: 'Hot' };
		if (hasTrending) return { class: 'GameThumbLabel_Trending', text: 'Trending' };
		if (hasNew || newByDate) return { class: 'GameThumbLabel_New', text: 'New' };
		return { class: 'GameThumbLabel_Hot', text: 'Hot' };
	}

	function renderGameItem(game) {
		var lb = getThumbLabel(game);
		var label = '<div class="GameThumbLabel ' + lb.class + '">' + lb.text + '</div>';
		return (
			'<div class="us-grid-game">' +
			'<a class="us-game-link" data-videosrc="" href="/' + game.slug + '/">' +
			'<div class="us-wrap-image">' +
			'<img alt="' + (game.name || game.slug) + '" height="200" loading="lazy" src="' + (game.image || '/upload/placeholder.png') + '" title="' + (game.name || game.slug) + '" width="200" />' +
			'<div class="us-game-title" title="' + (game.name || game.slug) + '"><span class="text-overflow">' + (game.name || game.slug) + '</span></div>' +
			'</div>' + label +
			'<div class="GameThumb_gradientVignette__Q04oZ"></div>' +
			'</a></div>'
		);
	}

	function normalizeImgSrc(src) {
		if (!src) return '/upload/placeholder.png';
		src = src.replace(/"/g, '&quot;');
		if (src.indexOf('http') === 0) return src;
		return src.charAt(0) === '/' ? src : '/' + src.replace(/^\//, '');
	}

	function renderStripItem(game) {
		var imgSrc = normalizeImgSrc(game.image);
		var name = (game.name || game.slug).replace(/</g, '&lt;').replace(/"/g, '&quot;');
		return (
			'<div class="us-grid-game">' +
			'<a class="us-game-link us-game-link-category" data-videosrc="" href="/' + game.slug + '/">' +
			'<div class="us-wrap-image">' +
			'<img alt="' + name + '" loading="lazy" src="' + imgSrc + '" title="' + name + '" onerror="this.src=\'/upload/placeholder.png\'" />' +
			'<div class="us-game-title"><span class="text-overflow">' + name + '</span></div>' +
			'</div>' +
			'<div class="GameThumb_gradientVignette__Q04oZ"></div>' +
			'</a></div>'
		);
	}

	function isSnowRiderCategory(g) {
		if (!g || !g.slug) return false;
		var main = g.categoryMain && g.categoryMain.slug ? String(g.categoryMain.slug).toLowerCase() : '';
		if (main === 'snow-rider.games' || main.indexOf('snow-rider') !== -1) return true;
		if (/snow\s*rider/i.test(g.name || '')) return true;
		var cats = (g.categories || []);
		return cats.some(function (c) {
			var s = String((c && c.slug) || (c && c.name) || '').toLowerCase();
			return s === 'snow-rider.games' || s.indexOf('snow-rider') !== -1 || s.indexOf('snow rider') !== -1;
		});
	}

	function runSnowRiderStrip() {
		var box = document.querySelector('#game-page .game-show-category .box-show-category');
		if (!box) return;

		var current = getCurrentSlug();

		function fillStripFromApi(gamesFromApi) {
			var list = (gamesFromApi || []).filter(function (g) {
				if (!g.slug || g.slug === current) return false;
				return isSnowRiderCategory(g);
			});
			list.sort(function (a, b) {
				var da = (a.updatedAt || '').replace(/-/g, '');
				var db = (b.updatedAt || '').replace(/-/g, '');
				return db.localeCompare(da);
			});
			box.innerHTML = list.map(renderStripItem).join('');
			setupStripScroll(box, list.length);
		}

		function setupStripScroll(boxEl, count) {
			var gap = 10;
			var viewport = boxEl.parentElement;
			if (count <= STRIP_VISIBLE) return;

			boxEl.classList.add('trending-strip--scroll');

			function setStripWidth() {
				var stripPadding = 20;
				var w = (boxEl && boxEl.clientWidth) ? (boxEl.clientWidth - stripPadding) : (viewport && viewport.offsetWidth ? viewport.offsetWidth - stripPadding : 780);
				var itemW = (w - gap * (STRIP_VISIBLE - 1)) / STRIP_VISIBLE;
				if (itemW < 50) itemW = 50;
				var totalW = count * itemW + (count - 1) * gap;
				boxEl.style.minWidth = totalW + 'px';
				boxEl.style.width = totalW + 'px';
				var items = boxEl.querySelectorAll('.us-grid-game');
				for (var i = 0; i < items.length; i++) {
					items[i].style.flex = '0 0 ' + itemW + 'px';
					items[i].style.width = itemW + 'px';
					items[i].style.minWidth = itemW + 'px';
					items[i].style.height = itemW + 'px';
					items[i].style.minHeight = itemW + 'px';
					items[i].style.paddingBottom = '0';
				}
			}

			setStripWidth();
			if (typeof window !== 'undefined') {
				window.addEventListener('resize', setStripWidth);
			}

			var scrollPos = 0;
			var direction = 1;
			var autoScroll = true;
			setInterval(function tick() {
				if (!autoScroll) return;
				var maxScroll = boxEl.scrollWidth - boxEl.clientWidth;
				if (maxScroll <= 0) return;
				scrollPos += direction * STRIP_SCROLL_SPEED;
				if (scrollPos >= maxScroll) {
					scrollPos = maxScroll;
					direction = -1;
				} else if (scrollPos <= 0) {
					scrollPos = 0;
					direction = 1;
				}
				boxEl.scrollLeft = scrollPos;
			}, STRIP_SCROLL_INTERVAL);

			var dragStartX = 0;
			var dragStartScroll = 0;
			function onMouseDown(e) {
				autoScroll = false;
				dragStartX = e.clientX;
				dragStartScroll = boxEl.scrollLeft;
			}
			function onMouseMove(e) {
				if (e.buttons !== 1) return;
				boxEl.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
			}
			function onMouseUp() {
				autoScroll = true;
				scrollPos = boxEl.scrollLeft;
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
			}
			boxEl.addEventListener('mousedown', function (e) {
				if (e.button !== 0) return;
				onMouseDown(e);
				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', onMouseUp);
			});
		}

		if (typeof fetch !== 'undefined') {
			fetch('/games.json')
				.then(function (r) { return r.json(); })
				.then(fillStripFromApi)
				.catch(function () { fillStripFromApi([]); });
		} else {
			fillStripFromApi([]);
		}
	}

	function isHotOrTrending(g) {
		if (!g || !g.slug) return false;
		var cats = (g.categories || []);
		var hasHot = cats.some(function (c) {
			var s = String((c && c.slug) || (c && c.name) || '').toLowerCase();
			return s.indexOf('hot') !== -1;
		});
		var hasTrending = cats.some(function (c) {
			var s = String((c && c.slug) || (c && c.name) || '').toLowerCase();
			return s.indexOf('trending') !== -1;
		});
		return hasHot || hasTrending;
	}

	function fillLeftSidebarFromApi(gamesFromApi) {
		var leftEl = document.querySelector('#game-page .game-box-left .us-grid-clayover-mini');
		if (!leftEl) return;
		var current = getCurrentSlug();
		var list = (gamesFromApi || []).filter(function (g) {
			return g.slug && g.slug !== current && isHotOrTrending(g);
		});
		list.sort(function (a, b) {
			var da = (a.updatedAt || '').replace(/-/g, '');
			var db = (b.updatedAt || '').replace(/-/g, '');
			return db.localeCompare(da);
		});
		list = list.slice(0, HOT_MAX);
		leftEl.innerHTML = list.map(function (g) {
			var item = { slug: g.slug, name: g.name, image: g.image || '/upload/placeholder.png', categories: g.categories };
			return renderGameItem(item, false);
		}).join('');
	}

	function fillRightSidebarFromApi(gamesFromApi) {
		var rightEl = document.querySelector('#game-page .game-box-right .us-grid-clayover-mini');
		if (!rightEl) return;
		var current = getCurrentSlug();
		var list = (gamesFromApi || []).filter(function (g) {
			return g.slug && g.slug !== current;
		});
		list.sort(function (a, b) {
			var da = (a.updatedAt || '').replace(/-/g, '');
			var db = (b.updatedAt || '').replace(/-/g, '');
			return db.localeCompare(da);
		});
		list = list.slice(0, NEW_MAX);
		rightEl.innerHTML = list.map(function (g) {
			var item = { slug: g.slug, name: g.name, image: g.image || '/upload/placeholder.png', categories: g.categories };
			return renderGameItem(item);
		}).join('');
	}

	function run() {
		var current = getCurrentSlug();
		if (!current) return;

		if (typeof fetch !== 'undefined') {
			fetch('/games.json')
				.then(function (r) { return r.json(); })
				.then(function (games) {
					fillLeftSidebarFromApi(games);
					fillRightSidebarFromApi(games);
				})
				.catch(function () {
					fillLeftSidebarFromApi([]);
					fillRightSidebarFromApi([]);
				});
		} else {
			fillLeftSidebarFromApi([]);
			fillRightSidebarFromApi([]);
		}

		runSnowRiderStrip();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run);
	} else {
		run();
	}
})();
