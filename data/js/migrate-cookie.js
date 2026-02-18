const azStorage = new GMStorage();
const cookie_name = "cookie_game";
const MIGRATE_FLAG = "migrated_cookie_recent";

function getCookieByName(name) {
    const nameEQ = name + "=";
    return document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith(nameEQ))
        ?.substring(nameEQ.length) || null;
}

function removeCookie(name, path = "/", domain = null) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};${domain ? " domain=" + domain + ";" : ""}`;
}

(function migrateCookieToLocalStorage() {
    if (localStorage.getItem(MIGRATE_FLAG)) return;

    const cookie_recent = getCookieByName(cookie_name);
    if (!cookie_recent) return;

    try {
        const fromCookie = JSON.parse(cookie_recent);
        if (Array.isArray(fromCookie)) {
            const current = azStorage.arrayRecentStorage || [];
            const merged = [...current, ...fromCookie].reduce((acc, item) => {
                if (!acc.some(g => g.slug === item.slug)) acc.push(item);
                return acc;
            }, []);

            azStorage.arrayRecentStorage = merged.slice(-azStorage.limit);
            azStorage.save();
        }
    } catch (e) {
        console.error("Migrate cookie failed:", e);
    }

    removeCookie(cookie_name);
    removeCookie("cookie_permission");
    localStorage.setItem(MIGRATE_FLAG, "1");
})();
