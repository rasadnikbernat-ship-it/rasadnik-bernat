const en = require('./en.json');
const hr = require('./hr.json');

function carouselInit() {
  document.querySelectorAll('.carousel')
    .forEach(el => new bootstrap.Carousel(el));
}

function translatePage() {
  document.querySelectorAll('[data-i18n]')
    .forEach(el => {
      const key = el.dataset.i18n;
      el.innerHTML = i18next.t(key);
    });
}

function rerender(locale) {
  document.querySelectorAll('.nav-link-language-active')
    .forEach(el => el.classList.remove('nav-link-language-active'));
  const activeButton = document.getElementById(locale);
  if (activeButton) activeButton.classList.add('nav-link-language-active');
  document.documentElement.lang = locale;
  translatePage();
}

function changeLocale(locale) {
  i18next.changeLanguage(locale, () => {
    rerender(locale);
    localStorage.setItem('i18nextLng', locale);
  });
}

function i18nInit() {
  i18next
    .init({
      debug: false,
      fallbackLng: 'hr',
      supportedLngs: ['en', 'hr'],
      load: 'languageOnly',
      resources: {
        en: {
          translation: en
        },
        hr: {
          translation: hr
        }
      }
    }, (err) => {
      if (err) return console.error(err);
      document.getElementById('hr')?.addEventListener('click', () => changeLocale('hr'));
      document.getElementById('en')?.addEventListener('click', () => changeLocale('en'));
      rerender(i18next.resolvedLanguage);
    });
}

function galleryInit() {
  GLightbox({
    selector: '.glightbox',
    touchNavigation: true,
    loop: false,
    zoomable: false,
    autoplayVideos: false,
    openEffect: 'none',
    closeEffect: 'none',
    slideEffect: 'none',
    preload: false
  });
}

function navbarInit() {
  const navbarCollapse = document.getElementById('navbarCollapse');
  const collapse = bootstrap.Collapse.getOrCreateInstance(navbarCollapse, { toggle: false });
  document.querySelectorAll('.nav-link, .navbar-brand')
    .forEach(el => {
      el.addEventListener('click', () => {
        collapse.hide();
      });
    });
}

function cookiesInit() {
  if (!localStorage.getItem('cookiesAccepted')) {
    document.getElementById('cookie-banner').style.display = 'block';
  }

  document.getElementById('cookie-accept').addEventListener('click', function () {
    localStorage.setItem('cookiesAccepted', 'true');
    document.getElementById('cookie-banner').style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  i18nInit();
  carouselInit();
  galleryInit();
  navbarInit();
  cookiesInit();
});