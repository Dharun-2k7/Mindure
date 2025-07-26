const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.getElementById('mindure-override').addEventListener('click', () => {
    window.location.href = window.location.href; // Reload to remove overlay
});

document.getElementById('mindure-close-tab').addEventListener('click', () => {
    window.close();
});