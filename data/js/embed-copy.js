document.addEventListener('DOMContentLoaded', () => {
    const input = document.querySelector('.az-games__embed-link');
    const btn = document.querySelector('.az-games__embed-button');

    if (!input || !btn) return;

    input.addEventListener('click', () => input.select());

    btn.addEventListener('click', async () => {
        btn.classList.add('active');
        try {
            await navigator.clipboard.writeText(input.value);
        } catch (e) {
            input.select();
            document.execCommand('copy');
        }
        setTimeout(() => btn.classList.remove('active'), 1000);
    });
});
