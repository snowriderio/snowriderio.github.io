let gamesData = [];
async function loadGamesData() {
    try {
        const response = await fetch('/games.json');
        gamesData = await response.json();
    } catch (error) {
        console.error('Failed to load games data:', error);
        gamesData = [];
    }
}
function getGameCategoryName(game) {
    if (game.categoryMain && game.categoryMain.name) return game.categoryMain.name;
    if (game.categories && game.categories[0] && game.categories[0].name) return game.categories[0].name;
    return game.category || '';
}
function searchGames(query, maxResults = 20) {
    if (!query || query.length < 2) return [];

    query = query.toLowerCase();
    return gamesData.filter(game => {
        const name = (game.name || '').toLowerCase();
        const desc = (game.description || '').toLowerCase();
        const catName = getGameCategoryName(game).toLowerCase();
        const catAll = (game.categories || []).map(c => (c.name || '').toLowerCase()).join(' ');
        return name.includes(query) || desc.includes(query) || catName.includes(query) || catAll.includes(query);
    }).slice(0, maxResults);
}
function displaySearchResults(results, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = '<div class="no-results">No games found</div>';
        container.classList.add('show');
        return;
    }

    const html = results.map(game => `
				<div class="search-result-item" onclick="navigateToGame('${game.slug}')">
					<img src="${game.image}" alt="${game.name}" class="search-result-image" 
						 onerror="this.src='/themes/snowrider3d/rs/imgs/default-game.png'">
					<div class="search-result-info">
						<div class="search-result-title">${game.name}</div>
					</div>
				</div>
			`).join('');

    container.innerHTML = html;
    container.classList.add('show');
}
function navigateToGame(slug) {
    const s = (slug || '').replace(/\/$/, '');
    window.location.href = '/' + (s ? s + '/' : '');
}

function categoryUrl(slug) {
    return '/' + (slug || '').replace(/^\//, '').replace(/\/$/, '') + '.games/';
}

function getUniqueCategories(maxCount) {
    const seen = new Set();
    const out = [];
    for (const game of gamesData) {
        const list = game.categories || (game.categoryMain ? [game.categoryMain] : []);
        for (const c of list) {
            const slug = (c.slug || (c.name || '').toLowerCase().replace(/\s+/g, '-')).replace(/[^a-z0-9-]/gi, '');
            if (slug && !seen.has(slug)) {
                seen.add(slug);
                out.push({ name: c.name || slug, slug: slug });
                if (out.length >= maxCount) return out;
            }
        }
    }
    return out;
}

function getHotGames(count) {
    return [...gamesData]
        .filter(function (g) {
            const cats = (g.categories || []).map(function (c) { return (c.slug || c.name || '').toLowerCase(); });
            return cats.indexOf('hot-games') >= 0 || (g.playsPerMonth || 0) > 0;
        })
        .sort(function (a, b) { return (b.playsPerMonth || 0) - (a.playsPerMonth || 0); })
        .slice(0, count);
}

function getSuggestedGames(count, excludeSlug) {
    return [...gamesData]
        .filter(function (g) { return g.slug && g.slug !== excludeSlug; })
        .sort(function (a, b) { return (b.playsPerMonth || 0) - (a.playsPerMonth || 0); })
        .slice(0, count);
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderGameCard(game) {
    var slug = escapeAttr(game.slug);
    var name = escapeAttr(game.name);
    var img = escapeAttr(game.image || '');
    return '<div class="search-result-item" onclick="navigateToGame(\'' + slug + '\')">' +
        '<img src="' + img + '" alt="' + name + '" class="search-result-image" onerror="this.src=\'/themes/snowrider3d/rs/imgs/default-game.png\'">' +
        '<div class="search-result-info"><div class="search-result-title">' + name + '</div></div>' +
        '</div>';
}
function hideSearchResults(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.classList.remove('show');
    }
}
function setupSearchBox(inputId, resultsId) {
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);

    if (!input || !results) return;

    let searchTimeout;

    input.addEventListener('input', function () {
        const query = this.value.trim();

        clearTimeout(searchTimeout);

        if (query.length < 2) {
            hideSearchResults(resultsId);
            return;
        }
        results.innerHTML = '<div class="search-loading">Loading...</div>';
        results.classList.add('show');
        const doSearch = function () {
            const searchResults = searchGames(query);
            displaySearchResults(searchResults, resultsId);
        };
        if (gamesData.length === 0) {
            loadGamesData().then(doSearch);
        } else {
            searchTimeout = setTimeout(doSearch, 300);
        }
    });
    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            hideSearchResults(resultsId);
        }
    });
    input.addEventListener('focus', function () {
        const query = this.value.trim();
        if (query.length >= 2) {
            if (gamesData.length === 0) {
                loadGamesData().then(function () {
                    const searchResults = searchGames(query);
                    displaySearchResults(searchResults, resultsId);
                });
            } else {
                const searchResults = searchGames(query);
                displaySearchResults(searchResults, resultsId);
            }
        }
    });
    const form = input.closest('form');
    if (form) {
        form.addEventListener('submit', function (e) {
            const query = input.value.trim();
            if (query) {
                return true;
            }
            e.preventDefault();
        });
    }
}
function renderSearchPageResults() {
    const container = document.getElementById('search-page-results');
    const queryInput = document.getElementById('search-page-query');
    if (!container) return;
    const params = new URLSearchParams(window.location.search);
    const q = (params.get('q') || '').trim();
    if (queryInput) queryInput.value = q;
    if (!q) {
        container.innerHTML = '';
        return;
    }
    const results = searchGames(q, 30);
    if (results.length === 0) {
        const safeQ = escapeAttr(q);
        const hotGames = getHotGames(8);
        const hotSlugs = new Set(hotGames.map(function (g) { return g.slug; }));
        const suggestedGames = getSuggestedGames(8).filter(function (g) { return !hotSlugs.has(g.slug); });
        var html = '<div class="search-no-results-wrap">';
        html += '<p class="search-no-results-msg">No games found for &quot;' + safeQ + '&quot;. Try another keyword or browse below.</p>';
        if (hotGames.length > 0) {
            html += '<section class="search-no-results-section"><h2 class="search-no-results-title">Hot games</h2>';
            html += '<div class="search-page-results search-no-results-grid">';
            hotGames.forEach(function (g) { html += renderGameCard(g); });
            html += '</div></section>';
        }
        if (suggestedGames.length > 0) {
            html += '<section class="search-no-results-section"><h2 class="search-no-results-title">More games to try</h2>';
            html += '<div class="search-page-results search-no-results-grid">';
            suggestedGames.forEach(function (g) { html += renderGameCard(g); });
            html += '</div></section>';
        }
        html += '</div>';
        container.innerHTML = html;
        container.classList.add('search-no-results');
        return;
    }
    container.classList.remove('search-no-results');
    container.innerHTML = results.map(game => {
        const slug = escapeAttr(game.slug);
        const name = escapeAttr(game.name);
        const img = escapeAttr(game.image || '');
        return '<div class="search-result-item" onclick="navigateToGame(\'' + slug + '\')">' +
            '<img src="' + img + '" alt="' + name + '" class="search-result-image" onerror="this.src=\'/themes/snowrider3d/rs/imgs/default-game.png\'">' +
            '<div class="search-result-info"><div class="search-result-title">' + name + '</div></div>' +
            '</div>';
    }).join('');
}

function runSearchInit() {
    setupSearchBox('txt-search1', 'search-results-desktop');
    setupSearchBox('txt-search2', 'search-results-mobile');
}

document.addEventListener('DOMContentLoaded', async function () {
    var isMobile = typeof window.matchMedia !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
        runSearchInit();
        if (/^\/search\/?$/.test(window.location.pathname)) {
            await loadGamesData();
            renderSearchPageResults();
        } else {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(async function () {
                    await loadGamesData();
                }, { timeout: 2000 });
            } else {
                setTimeout(function () { loadGamesData(); }, 100);
            }
        }
    } else {
        await loadGamesData();
        runSearchInit();
        if (/^\/search\/?$/.test(window.location.pathname)) {
            renderSearchPageResults();
        }
    }
});