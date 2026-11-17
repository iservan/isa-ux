(function () {
    var STORAGE_KEY = 'theme';

    function getTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
        } catch (e) {
            return 'light';
        }
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {}
        updateToggle(theme);
    }

    function updateToggle(theme) {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        var isDark = theme === 'dark';
        btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    function markCurrentNav() {
        var path = window.location.pathname.split('/').pop() || 'index.html';
        var links = document.querySelectorAll('#mainNav .nav-link');
        links.forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href || href.charAt(0) === '#') return;
            var file = href.split('/').pop().split('?')[0].split('#')[0];
            if (file === path) link.setAttribute('aria-current', 'page');
        });
    }

    function init() {
        applyTheme(getTheme());
        markCurrentNav();
        var btn = document.getElementById('themeToggle');
        if (btn) {
            btn.addEventListener('click', function () {
                applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
