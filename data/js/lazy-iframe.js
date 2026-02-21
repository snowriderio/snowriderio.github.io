/**
 * Lazy-load game iframe (homepage) to improve LCP and TBT.
 * Poster image paints first (LCP); iframe loads after delay.
 */
(function () {
    'use strict';
    var iframe = document.getElementById('iframehtml5');
    if (!iframe || !iframe.getAttribute('data-src')) return;

    var wrap = document.getElementById('game-iframe-wrap');
    var poster = document.getElementById('game-iframe-poster');

    function loadIframe() {
        var src = iframe.getAttribute('data-src');
        if (!src) return;
        iframe.setAttribute('src', src);
        iframe.removeAttribute('data-src');
        iframe.addEventListener('load', function onLoad() {
            iframe.removeEventListener('load', onLoad);
            if (wrap) wrap.classList.add('poster-hidden');
        }, { once: true });
        if (poster) poster.setAttribute('loading', 'lazy');
    }

    var minDelay = 7000;
    var start = Date.now();
    function maybeLoad() {
        if (iframe.getAttribute('data-src') && (Date.now() - start) >= minDelay) {
            loadIframe();
            return true;
        }
        return false;
    }
    setTimeout(function () {
        if (maybeLoad()) return;
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(function () { maybeLoad(); }, { timeout: 500 });
        } else {
            maybeLoad();
        }
    }, minDelay);
})();
