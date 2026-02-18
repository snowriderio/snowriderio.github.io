
document.addEventListener('DOMContentLoaded', function () {
    const expandBtn = document.getElementById('expand');
    const exitFullscreenBtn = document.getElementById('_exit_full_screen');
    const iframe = document.getElementById('iframehtml5');
    function enterFullscreen() {
        if (iframe.requestFullscreen) {
            iframe.requestFullscreen();
        } else if (iframe.webkitRequestFullscreen) {
            iframe.webkitRequestFullscreen();
        } else if (iframe.msRequestFullscreen) {
            iframe.msRequestFullscreen();
        } else if (iframe.mozRequestFullScreen) {
            iframe.mozRequestFullScreen();
        }
    }
    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        }
    }
    if (expandBtn) {
        expandBtn.addEventListener('click', function () {
            enterFullscreen();
        });
    }
    if (exitFullscreenBtn) {
        exitFullscreenBtn.addEventListener('click', function () {
            exitFullscreen();
        });
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    function handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);

        if (isFullscreen) {
            if (exitFullscreenBtn) {
                exitFullscreenBtn.classList.remove('hidden');
            } if (expandBtn) {
                expandBtn.style.display = 'none';
            }
        } else {
            if (exitFullscreenBtn) {
                exitFullscreenBtn.classList.add('hidden');
            } if (expandBtn) {
                expandBtn.style.display = 'inline-block';
            }
        }
    }
});
