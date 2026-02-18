/**
 * Drag-to-scroll for Related Games horizontal strips.
 * User can hold mouse and drag left/right to scroll (no visible scrollbar).
 */
(function () {
	'use strict';

	var selector = '.related-games__grid, .similar-games-cards__grid';

	function initDragScroll(el) {
		var isDown = false;
		var lastPageX;
		var didDrag = false;

		el.addEventListener('mousedown', function (e) {
			isDown = true;
			didDrag = false;
			el.style.cursor = 'grabbing';
			el.style.userSelect = 'none';
			lastPageX = e.pageX;
		});

		el.addEventListener('mouseleave', function () {
			isDown = false;
			el.style.cursor = 'grab';
			el.style.userSelect = '';
		});

		el.addEventListener('mouseup', function () {
			isDown = false;
			el.style.cursor = 'grab';
			el.style.userSelect = '';
		});

		el.addEventListener('mousemove', function (e) {
			if (!isDown) return;
			var dx = e.pageX - lastPageX;
			if (Math.abs(dx) > 2) didDrag = true;
			lastPageX = e.pageX;
			e.preventDefault();
			el.scrollLeft -= dx;
		});

		// Prevent link click when user dragged
		el.addEventListener('click', function (e) {
			if (didDrag && e.target.closest('a')) {
				e.preventDefault();
				e.stopPropagation();
			}
		}, true);
	}

	function init() {
		var grids = document.querySelectorAll(selector);
		for (var i = 0; i < grids.length; i++) {
			var el = grids[i];
			if (el._relatedGamesScroll) continue;
			el._relatedGamesScroll = true;
			el.style.cursor = 'grab';
			initDragScroll(el);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
