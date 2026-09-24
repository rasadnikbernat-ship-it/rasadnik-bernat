const en = require('./en.json');
const hr = require('./hr.json');
const lngs = { en, hr };

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

function rerender(lng) {
  document.querySelectorAll('.nav-link-language-active')
    .forEach(el => el.classList.remove('nav-link-language-active'));
  const activeButton = document.getElementById(lng);
  if (activeButton) activeButton.classList.add('nav-link-language-active');
  document.documentElement.lang = lng;
  translatePage();
}

function changeLng(lng) {
  updatePriceListLinks(lng)
  i18next.changeLanguage(lng, () => {
    rerender(lng);
    localStorage.setItem('i18nextLng', lng);
  });
}

function i18nInit(lng) {
  i18next
    .init({
      lng,
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
      document.getElementById('hr')?.addEventListener('click', () => changeLng('hr'));
      document.getElementById('en')?.addEventListener('click', () => changeLng('en'));
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

function navbarInit(lng) {
  updatePriceListLinks(lng);
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

function updatePriceListLinks(lng) {
  const priceListPDFLink = document.getElementById('price-list-pdf');
  const priceListXMLLink = document.getElementById('price-list-xml');

  if (priceListPDFLink) priceListPDFLink.href = `docs/${lngs[lng].fileName}.pdf`;
  if (priceListXMLLink) priceListXMLLink.href = `docs/${lngs[lng].fileName}.xml`;
}

document.addEventListener('DOMContentLoaded', () => {
  const lng = localStorage.getItem('i18nextLng');
  i18nInit(lng);
  carouselInit();
  galleryInit();
  navbarInit(lng);
  cookiesInit();
});