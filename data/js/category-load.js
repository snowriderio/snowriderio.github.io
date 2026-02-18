let id_game = '';
let url_game = '';
let order_type = "";
let field_order = "";
let tag_id = "";
let category_id = "";
let keywords = "";
let is_hot = "";
let is_new = "";
let is_trending = "";
let is_popular = "";
let limit = "";
let topz = "";
let slug_home = "";
let title = "";
let max_page = '';;
let game_name, game_slug, game_image;
const azStorage = new GMStorage();
const cookie_name = "cookie_game";
const MIGRATE_FLAG = "migrated_cookie_recent";

function getCookieByName(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let c of ca) {
        c = c.trim();
        if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length));
        }
    }
    return null;
}

function removeCookie(name, path = "/", domain = null) {
    document.cookie = name +
        "=; expires=Thu, 01 Jan 1970 00:00:00 UTC;" +
        " path=" + path + ";" +
        (domain ? " domain=" + domain + ";" : "");
}

(function migrateCookieToLocalStorage() {
    if (localStorage.getItem(MIGRATE_FLAG)) return;

    const cookie_recent = getCookieByName(cookie_name);
    if (!cookie_recent) return;

    try {
        const fromCookie = JSON.parse(cookie_recent);
        if (Array.isArray(fromCookie)) {
            const current = azStorage.arrayRecentStorage || [];
            const merged = [...current, ...fromCookie]
                .reduce((acc, item) => {
                    if (!acc.some(g => g.slug === item.slug)) acc.push(item);
                    return acc;
                }, []);
            azStorage.arrayRecentStorage = merged.slice(-azStorage.limit);
            azStorage.save();
        }
    } catch (err) {
        console.error("Failed to parse cookie_recent:", err);
    }

    removeCookie(cookie_name);
    removeCookie("cookie_permission");
    localStorage.setItem(MIGRATE_FLAG, "1");
})();