(function () {
    function loadScript(src, callback) {
        const script = document.createElement("script");
        script.src = src;
        script.onload = callback;
        document.body.appendChild(script);
    }

    function initRating() {
        if (typeof $ === 'undefined' || !$.fn.raty) return;

        // rating readonly list
        $('.default-rating').raty({
            readOnly: function () {
                return $(this).data('readonly');
            },
            score: function () {
                return $(this).attr('data-score');
            }
        });

        initRatingClick();
    }

    function initRatingClick() {
        const $el = $('#default-demo');
        if (!$el.length) return;

        const style = '-big';
        const readonly = $el.attr('data-readonly');

        $el.raty({
            readOnly: readonly,
            cancelOff: dir_theme + 'rs/plugins/raty/images/cancel-off.png',
            cancelOn: dir_theme + 'rs/plugins/raty/images/cancel-on.png',
            starHalf: dir_theme + 'rs/plugins/raty/images/star-half' + style + '.png',
            starOff: dir_theme + 'rs/plugins/raty/images/star-off' + style + '.png',
            starOn: dir_theme + 'rs/plugins/raty/images/star-on' + style + '.png',
            half: true,
            number: 5,
            numberMax: 5,
            score: function () {
                return $(this).attr('data-score');
            },
            click: function (score) {
                submitRating($(this), score, style);
            }
        });
    }

    function submitRating($el, score, style) {
        const game_id = $el.attr('data-id');
        const rate = $el.attr('data-score');

        $.ajax({
            type: "POST",
            url: "/rate-game.ajax",
            data: {
                game_id: game_id,
                score: score
            },
            cache: false,
            success: function (res) {
                const data = $.parseJSON(res);

                $('#countrate').text(data.rate_count + ' votes');
                $('#averagerate').text(data.rate_average);

                updateBar('gorgeous', data.gorgeous);
                updateBar('good', data.good);
                updateBar('regular', data.regular);
                updateBar('poor', data.poor);
                updateBar('bad', data.bad);

                $(".rating-num, .rate-title")
                    .removeClass()
                    .addClass(data.class);

                $(".rate-title").text(data.name);

                lockRating($el, score, style);
            },
            error: function () {
                lockRating($el, rate, style);
            }
        });
    }

    function updateBar(name, value) {
        $(`#${name}-bar`).css("width", value + "%");
        $(`#${name}-bar-value`).text(value + "%");
    }

    function lockRating($el, score, style) {
        $el.raty({
            readOnly: true,
            cancelOff: dir_theme + 'rs/plugins/raty/images/cancel-off.png',
            cancelOn: dir_theme + 'rs/plugins/raty/images/cancel-on.png',
            starHalf: dir_theme + 'rs/plugins/raty/images/star-half' + style + '.png',
            starOff: dir_theme + 'rs/plugins/raty/images/star-off' + style + '.png',
            starOn: dir_theme + 'rs/plugins/raty/images/star-on' + style + '.png',
            half: true,
            number: 5,
            numberMax: 5,
            score: score
        });
        $el.css("cursor", "pointer");
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (typeof $ === 'undefined') return;

        loadScript('/themes/snowrider3dd/rs/plugins/raty/jquery.raty.js', initRating);
    });
})();
