const en = require('./en.json');
const hr = require('./hr.json');
const lngs = { en, hr };
const SUPPORTED = ['hr', 'en'];

// localStorage može biti blokiran (privatni način, postavke preglednika) -> nikad ne baca.
const store = {
  get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
};

// Pokreni dio stranice; greška u jednom (npr. CDN skripta se nije učitala) ne smije srušiti ostale.
function safe(name, fn) {
  try { fn(); } catch (e) { console.error(`[${name}]`, e); }
}

function carouselInit() {
  document.querySelectorAll('.carousel')
    .forEach(el => new bootstrap.Carousel(el));
}

function translatePage() {
  document.querySelectorAll('[data-i18n]')
    .forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = i18next.t(key);
    });
}

function rerender(lng) {
  document.querySelectorAll('.nav-link-language-active')
    .forEach(el => el.classList.remove('nav-link-language-active'));
  const activeButton = document.getElementById(lng);
  if (activeButton) activeButton.classList.add('nav-link-language-active');
  SUPPORTED.forEach((code) => {
    const b = document.getElementById(code);
    if (b) b.setAttribute('aria-pressed', code === lng ? 'true' : 'false');
  });
  document.documentElement.lang = lng;
  translatePage();
}

function changeLng(lng) {
  updatePriceListLinks(lng);
  i18next.changeLanguage(lng, () => {
    rerender(lng);
    store.set('i18nextLng', lng);
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
      SUPPORTED.forEach((code) => {
        document.getElementById(code)?.addEventListener('click', (e) => { e.preventDefault(); changeLng(code); });
      });
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

  document.querySelectorAll('.nav-link, .dropdown-item, .navbar-brand')
    .forEach(el => {
      el.addEventListener('click', () => {
        if (el.classList.contains('dropdown-toggle')) {
          return;
        }
        collapse.hide();
      });
    });
}

function cookiesInit() {
  const banner = document.getElementById('cookie-banner');
  if (!banner) return;
  if (!store.get('cookiesAccepted')) banner.style.display = 'block';
  document.getElementById('cookie-accept')?.addEventListener('click', function () {
    store.set('cookiesAccepted', 'true');
    banner.style.display = 'none';
  });
}

function updatePriceListLinks(lng) {
  const priceListPDFLink = document.getElementById('price-list-pdf');
  const priceListXMLLink = document.getElementById('price-list-xml');

  const file = (lngs[lng] || lngs.hr).fileName;
  if (priceListPDFLink) priceListPDFLink.href = `docs/${file}.pdf`;
  if (priceListXMLLink) priceListXMLLink.href = `docs/${file}.xml`;
}

document.addEventListener('DOMContentLoaded', () => {
  const stored = store.get('i18nextLng');
  const lng = SUPPORTED.includes(stored) ? stored : 'hr';
  // Kolačići prvi: banner mora raditi i ako se neka vanjska skripta nije učitala.
  safe('cookies', cookiesInit);
  safe('i18n', () => i18nInit(lng));
  safe('carousel', carouselInit);
  safe('gallery', galleryInit);
  safe('navbar', () => navbarInit(lng));
});