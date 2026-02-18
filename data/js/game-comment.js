(function () {
    jQuery(function ($) {

        // Scroll to comment form
        $("#go_to_comment, #btn_comments_area").on("click", function () {
            $("html, body").animate({
                scrollTop: $("#comment_form").offset().top
            }, 1000);
        });

        // Validate & submit comment
        $("#comment_form").validate({
            focusInvalid: false,
            onfocusout: false,
            errorElement: "div",
            errorPlacement: function (error) {
                error.appendTo("#comment_errors");
            },
            ignore: ".ignore",
            rules: {
                comment_content: { required: true, maxlength: 65525 },
                comment_author: { required: true, maxlength: 50 },
                comment_email: { required: true, email: true, maxlength: 100 },
                commentChecked: { required: true }
            },
            messages: {
                comment_content: { required: "Please type your comment!" },
                comment_author: { required: "Please type your name!" },
                comment_email: {
                    required: "Please type your email",
                    email: "Check your email is not exactly!"
                },
                commentChecked: {
                    required: "Please agree to the terms and conditions before comment."
                }
            },
            submitHandler: submitComment
        });

        // Load more comment
        $(document).on("click", "#load_more_comment", function (e) {
            e.preventDefault();
            load_comment(
                $(this).data("page"),
                $(this).data("limit"),
                $(this).data("sort"),
                $(this).data("url"),
                "#list_comment",
                ""
            );
        });

        // Sort comment
        $("#sort_by").on("change", function () {
            load_comment(1, 5, this.value, window.location.href, "#list_comment", "f5");
        });
    });

    // ===== GLOBAL FUNCTIONS =====

    window.reply_to = function (id) {
        $("#comment_form")
            .addClass("commentBlock")
            .appendTo("#comment_" + id);
        $("#parent_id").val(id);
        $("#btn_cancel").removeClass("hidden");
    };

    window.reply_all = function () {
        $("#comment_form")
            .removeClass("commentBlock")
            .appendTo(".make-comment")
            .trigger("reset");
        $("#parent_id").val(0);
        $("#btn_cancel").addClass("hidden");
    };

    window.comment_vote = function (id, vote) {
        $.post("/comment-vote.ajax", { comment_id: id, vote }, function (res) {
            const data = JSON.parse(res);
            if (!data.result) return;

            if (vote === "up") {
                $("#comment_voteup_" + id).html(data.comment.like);
            } else {
                $("#comment_votedown_" + id).html(data.comment.dislike);
            }
        });
    };

    window.load_comment = function (page, limit, sort, url, container, refresh) {
        $(".comment-load-more").show();

        $.post("/comment-paging.ajax", {
            page, limit, sort, url
        }, function (html) {
            $(".comment-load-more").hide();
            refresh === "f5"
                ? $(container).html(html)
                : $(container).append(html);
        });
    };

    window.commentUpdateStatus = function (e, id) {
        $.post("/comment-update.ajax", {
            id,
            status: $(e).val()
        }, function (res) {
            alert(res == 1 ? "Update successfully!" : "Update failed!");
        });
    };

    function submitComment() {
        $(".comment_loading").show();

        $.post("/make-comment.ajax", $("#comment_form").serialize(), function (res) {
            $(".comment_loading").hide();
            const data = JSON.parse(res);
            if (!data.result) return;

            $("#list_comment").prepend(data.html);
            $("#comment_form").trigger("reset");
        });
    }

})();
