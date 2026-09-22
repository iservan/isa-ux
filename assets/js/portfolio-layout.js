(function () {
  var STORAGE_KEY = 'portfolio-layout';
  var switchEl = document.getElementById('layoutSwitch');
  var filtersEl = document.getElementById('filters');
  var currentFilter = '*';

  if (!switchEl) return;

  function getLayout() {
    return document.documentElement.getAttribute('data-portfolio-layout') === 'slide' ? 'slide' : 'grid';
  }

  function updateSwitch(layout) {
    var buttons = switchEl.querySelectorAll('[data-layout]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-layout') === layout;
      buttons[i].classList.toggle('is-active', on);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setLayout(layout) {
    if (layout === 'slide') {
      document.documentElement.setAttribute('data-portfolio-layout', 'slide');
    } else {
      document.documentElement.removeAttribute('data-portfolio-layout');
      layout = 'grid';
    }

    try {
      localStorage.setItem(STORAGE_KEY, layout);
    } catch (e) {}

    updateSwitch(layout);

    if (layout === 'slide') {
      requestAnimationFrame(function () {
        if (window.PortfolioCarousel && window.PortfolioCarousel.ensureStarted) {
          window.PortfolioCarousel.ensureStarted().then(function () {
            if (window.PortfolioCarousel.applyFilter) {
              window.PortfolioCarousel.applyFilter(currentFilter);
            }
          });
        }
      });
    } else {
      if (window.PortfolioCarousel && window.PortfolioCarousel.pause) {
        window.PortfolioCarousel.pause();
      }
      if (typeof grid === 'function') {
        grid();
      }
    }
  }

  switchEl.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-layout]');
    if (!btn) return;
    setLayout(btn.getAttribute('data-layout'));
  });

  if (filtersEl) {
    filtersEl.addEventListener('click', function (e) {
      var link = e.target.closest('a.link');
      if (!link) return;
      currentFilter = link.getAttribute('href') || '*';
      if (getLayout() === 'slide' && window.PortfolioCarousel && window.PortfolioCarousel.applyFilter) {
        window.PortfolioCarousel.applyFilter(currentFilter);
      }
    });
  }

  var activeFilter = filtersEl && filtersEl.querySelector('a.link.active');
  if (activeFilter) {
    currentFilter = activeFilter.getAttribute('href') || '*';
  }

  setLayout(getLayout());
})();
