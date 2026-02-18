document.addEventListener('DOMContentLoaded', function () {
    const tabButtons = document.querySelectorAll('.mygames__panel--tab-button');
    const tabLayouts = document.querySelectorAll('.tab-layout');
    if (!tabButtons.length || !tabLayouts.length) return;

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const targetLayoutId = button.dataset.tabTarget + '-layout';

            tabLayouts.forEach(layout => {
                layout.setAttribute('hidden', '');
            });

            const targetLayout = document.getElementById(targetLayoutId);
            if (targetLayout) {
                targetLayout.removeAttribute('hidden');
            }
        });
    });
});
