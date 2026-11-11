// Postavke weba koje uređuje korisnik (config.json -> site). Jedan izvor istine za generator i editor.
//   site = {
//     texts:  { hr: { "<ključ>": "tekst" }, en: { ... } },   // samo odstupanja od locales/*.json
//     layout: { bannerHeight, bannerOverlay, radius, cardHover, columns, mobileColumns, cardSize, imageRatio, fontSize },
//     sections: { order: [...], hidden: [...] },
//     meta:   { title, description },
//     galleryOrder: [ "slika1.jpg", ... ]
//   }
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

const baseHr = require('../locales/hr.json');
const baseEn = require('../locales/en.json');

// ---------- Tekstovi ----------
const TEXT_FIELDS = [
  { key: 'header', label: 'Naslov naslovnice', group: 'Naslovnica' },
  { key: 'intro', label: 'Uvodni tekst', group: 'Naslovnica', multiline: true },
  { key: 'nav.products', label: 'Izbornik: sadnice (i gumb na naslovnici)', group: 'Izbornik' },
  { key: 'nav.services', label: 'Izbornik: usluge (i gumb na naslovnici)', group: 'Izbornik' },
  { key: 'nav.about', label: 'Izbornik: o nama', group: 'Izbornik' },
  { key: 'nav.gallery', label: 'Izbornik: galerija (i naslov sekcije)', group: 'Izbornik' },
  { key: 'nav.contact', label: 'Izbornik: kontakt', group: 'Izbornik' },
  { key: 'nav.priceList', label: 'Izbornik: cjenik', group: 'Izbornik' },
  { key: 'product.details', label: 'Gumb na kartici sadnice', group: 'Ostalo' },
  { key: 'product.soldOut', label: 'Oznaka "rasprodano"', group: 'Ostalo' },
  { key: 'footer', label: 'Podnožje stranice', group: 'Ostalo' },
  { key: 'cookie-banner', label: 'Poruka o kolačićima', group: 'Kolačići', multiline: true },
  { key: 'cookieAccept', label: 'Gumb za prihvaćanje kolačića', group: 'Kolačići' },
];
const TEXT_KEYS = TEXT_FIELDS.map((f) => f.key);

function getByPath(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}
function setByPath(obj, key, value) {
  const parts = key.split('.');
  let o = obj;
  parts.slice(0, -1).forEach((k) => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[parts[parts.length - 1]] = value;
}

function baseFor(lang) { return lang === 'en' ? baseEn : baseHr; }

// Zadani tekstovi (iz locales/*.json) za sve uredive ključeve.
function getTextDefaults() {
  const out = { hr: {}, en: {} };
  TEXT_KEYS.forEach((k) => {
    out.hr[k] = getByPath(baseHr, k) || '';
    out.en[k] = getByPath(baseEn, k) || '';
  });
  return out;
}

// Kopija locale objekta s primijenjenim korisničkim tekstovima.
function applyTextOverrides(locale, lang, site) {
  const copy = JSON.parse(JSON.stringify(locale));
  const ov = (((site || {}).texts || {})[lang]) || {};
  TEXT_KEYS.forEach((k) => {
    const v = ov[k];
    if (typeof v === 'string' && v.trim() !== '') setByPath(copy, k, v);
  });
  return copy;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// {{t:ključ}} -> HR tekst (escapean). Nepoznat ključ ostaje prazan.
function applyTextTokens(html, site) {
  const hr = applyTextOverrides(baseHr, 'hr', site);
  return html.replace(/\{\{t:([\w.-]+)\}\}/g, (_, key) => {
    const v = getByPath(hr, key);
    return typeof v === 'string' ? escapeHtml(v) : '';
  });
}

// ---------- Izgled / raspored ----------
const BANNER_HEIGHTS = { low: '380px', medium: '540px', tall: '700px', full: '100vh' };
const RADII = { none: '0px', small: '4px', default: null, large: '18px', round: '32px' };
const FONT_SIZES = { small: '14px', normal: null, large: '18px', xlarge: '20px' };
const PRODUCT_COLUMNS = [2, 3, 4, 5, 6];
const MOBILE_COLUMNS = [1, 2];
// Veličina cijele kartice sadnice (slika + tekst) na tabletu/računalu:
// širina reda kartica (manji red = manje kartice, isti razmaci) i veličina teksta. Na mobitelu bez promjene.
const CARD_SIZES = {
  xsmall: { row: '70%', text: '1rem', btn: '.8rem', pad: '.5rem' },
  small: { row: '85%', text: '1.15rem', btn: '.875rem', pad: '.7rem' },
  normal: null,
  large: { row: null, container: '1600px', text: '1.6rem', btn: '1.05rem', pad: '1.2rem' },
};
const IMAGE_RATIOS = { portrait: null, square: '1/1', landscape: '4/3' };

const LAYOUT_DEFAULTS = {
  bannerHeight: 'tall',   // low | medium | tall | full
  bannerOverlay: 0,       // 0-80 (% tamnog preklopa preko slike)
  radius: 'default',      // none | small | default | large | round
  cardHover: true,        // povećanje kartice na hover
  columns: 4,             // kartica sadnica u redu (računalo): 2 | 3 | 4 | 5 | 6
  mobileColumns: 2,       // kartica sadnica u redu (mobitel): 1 | 2
  cardSize: 'normal',     // xsmall | small | normal | large (cijela kartica: slika + tekst)
  imageRatio: 'portrait', // portrait (4:5) | square (1:1) | landscape (4:3)
  fontSize: 'normal',     // small | normal | large | xlarge
};

const SECTION_DEFS = [
  { id: 'products', label: 'Sadnice' },
  { id: 'services', label: 'Usluge' },
  { id: 'about', label: 'O nama' },
  { id: 'gallery', label: 'Galerija' },
  { id: 'contact', label: 'Kontakt' },
];
const SECTION_IDS = SECTION_DEFS.map((s) => s.id);
const SECTION_THEMES = ['t1', 't2'];

// ---------- Gumbi na naslovnici ----------
const BTN_STYLES = { primary: 'btn-primary', secondary: 'btn-secondary', tertiary: 'btn-tertiary' };
const MAX_BANNER_BUTTONS = 4;
// Zadano: dva gumba koja vode na sekcije; prazan naziv = naziv sekcije iz izbornika.
const BANNER_DEFAULT = [
  { type: 'section', section: 'products', style: 'primary', hr: '', en: '' },
  { type: 'section', section: 'services', style: 'secondary', hr: '', en: '' },
];

function cleanButton(b) {
  if (!b || typeof b !== 'object') return null;
  const style = Object.prototype.hasOwnProperty.call(BTN_STYLES, b.style) ? b.style : 'primary';
  const hr = typeof b.hr === 'string' ? b.hr.trim().slice(0, 60) : '';
  const en = typeof b.en === 'string' ? b.en.trim().slice(0, 60) : '';
  if (b.type === 'link') {
    const url = typeof b.url === 'string' ? b.url.trim().slice(0, 300) : '';
    if (!/^(https?:\/\/|mailto:|tel:|#)\S+$/i.test(url)) return null;
    return { type: 'link', url, style, hr, en };
  }
  if (!SECTION_IDS.includes(b.section)) return null;
  return { type: 'section', section: b.section, style, hr, en };
}

const META_DEFAULTS = {
  title: 'Rasadnik Bernat | Sadnice hrasta, kestena i pošumljavanje',
  description: 'RasadnikBernat nudi sadnice hrasta, kestena i ostalog šumskog drveća te usluge pošumljavanja diljem Hrvatske. Kontejnerske i sadnice golog korijena za privatne i profesionalne projekte.',
};

function pick(val, allowed, fallback) {
  return Object.prototype.hasOwnProperty.call(allowed, val) ? val : fallback;
}

function normalizeSite(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const out = {};

  // texts: samo poznati ključevi, neprazni stringovi koji se razlikuju od zadanog
  const defs = getTextDefaults();
  const texts = {};
  ['hr', 'en'].forEach((lang) => {
    const src = ((raw.texts || {})[lang]) || {};
    const t = {};
    TEXT_KEYS.forEach((k) => {
      const v = typeof src[k] === 'string' ? src[k].trim() : '';
      if (v && v !== defs[lang][k]) t[k] = v.slice(0, 2000);
    });
    if (Object.keys(t).length) texts[lang] = t;
  });
  if (Object.keys(texts).length) out.texts = texts;

  // layout: zapisuju se samo odstupanja
  const l = raw.layout && typeof raw.layout === 'object' ? raw.layout : {};
  const layout = {};
  const bh = pick(l.bannerHeight, BANNER_HEIGHTS, LAYOUT_DEFAULTS.bannerHeight);
  if (bh !== LAYOUT_DEFAULTS.bannerHeight) layout.bannerHeight = bh;
  const ov = Math.max(0, Math.min(80, Math.round(Number(l.bannerOverlay) || 0)));
  if (ov !== LAYOUT_DEFAULTS.bannerOverlay) layout.bannerOverlay = ov;
  const rd = pick(l.radius, RADII, LAYOUT_DEFAULTS.radius);
  if (rd !== LAYOUT_DEFAULTS.radius) layout.radius = rd;
  if (l.cardHover === false) layout.cardHover = false;
  const cols = Number(l.columns);
  if (PRODUCT_COLUMNS.includes(cols) && cols !== LAYOUT_DEFAULTS.columns) layout.columns = cols;
  const mcols = Number(l.mobileColumns);
  if (MOBILE_COLUMNS.includes(mcols) && mcols !== LAYOUT_DEFAULTS.mobileColumns) layout.mobileColumns = mcols;
  const cs = pick(l.cardSize, CARD_SIZES, LAYOUT_DEFAULTS.cardSize);
  if (cs !== LAYOUT_DEFAULTS.cardSize) layout.cardSize = cs;
  const ir = pick(l.imageRatio, IMAGE_RATIOS, LAYOUT_DEFAULTS.imageRatio);
  if (ir !== LAYOUT_DEFAULTS.imageRatio) layout.imageRatio = ir;
  const fs_ = pick(l.fontSize, FONT_SIZES, LAYOUT_DEFAULTS.fontSize);
  if (fs_ !== LAYOUT_DEFAULTS.fontSize) layout.fontSize = fs_;
  if (Object.keys(layout).length) out.layout = layout;

  // sections: potpun, valjan poredak + skrivene
  const s = raw.sections && typeof raw.sections === 'object' ? raw.sections : {};
  const seen = new Set();
  const order = [];
  (Array.isArray(s.order) ? s.order : []).forEach((id) => {
    if (SECTION_IDS.includes(id) && !seen.has(id)) { seen.add(id); order.push(id); }
  });
  SECTION_IDS.forEach((id) => { if (!seen.has(id)) order.push(id); });
  const hidden = (Array.isArray(s.hidden) ? s.hidden : []).filter((id, i, a) => SECTION_IDS.includes(id) && a.indexOf(id) === i);
  const sections = {};
  if (order.join() !== SECTION_IDS.join()) sections.order = order;
  if (hidden.length) sections.hidden = hidden;
  // teme po sekciji: samo ručno odabrane (t1 | t2); sve ostalo = automatski (par/nepar)
  const themes = {};
  const st = s.themes && typeof s.themes === 'object' ? s.themes : {};
  SECTION_IDS.forEach((id) => { if (SECTION_THEMES.includes(st[id])) themes[id] = st[id]; });
  if (Object.keys(themes).length) sections.themes = themes;
  if (Object.keys(sections).length) out.sections = sections;

  // meta
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const meta = {};
  const title = typeof m.title === 'string' ? m.title.trim().slice(0, 200) : '';
  const desc = typeof m.description === 'string' ? m.description.trim().slice(0, 500) : '';
  if (title && title !== META_DEFAULTS.title) meta.title = title;
  if (desc && desc !== META_DEFAULTS.description) meta.description = desc;
  if (Object.keys(meta).length) out.meta = meta;

  // gumbi na naslovnici: zapisuju se samo ako se razlikuju od zadanih
  if (Array.isArray(raw.bannerButtons)) {
    const list = raw.bannerButtons.map(cleanButton).filter(Boolean).slice(0, MAX_BANNER_BUTTONS);
    if (JSON.stringify(list) !== JSON.stringify(BANNER_DEFAULT)) out.bannerButtons = list;
  }

  // galerija
  if (Array.isArray(raw.galleryOrder)) {
    const go = raw.galleryOrder.filter((f, i, a) => typeof f === 'string' && f && a.indexOf(f) === i);
    if (go.length) out.galleryOrder = go;
  }
  return out;
}

// Puna (s defaultima) verzija za editor.
function resolveSite(site) {
  site = normalizeSite(site);
  const sec = site.sections || {};
  return {
    texts: site.texts || {},
    layout: { ...LAYOUT_DEFAULTS, ...(site.layout || {}) },
    sections: {
      order: sec.order || SECTION_IDS.slice(),
      hidden: sec.hidden || [],
      themes: sec.themes || {},
    },
    meta: { ...META_DEFAULTS, ...(site.meta || {}) },
    galleryOrder: site.galleryOrder || [],
    bannerButtons: site.bannerButtons || JSON.parse(JSON.stringify(BANNER_DEFAULT)),
  };
}

function readSite() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).site || {}; } catch { return {}; }
}

// ---------- Sekcije / navigacija ----------
function getSectionPlan(site) {
  const r = resolveSite(site);
  return {
    order: r.sections.order.filter((id) => !r.sections.hidden.includes(id)),
    hidden: r.sections.hidden,
  };
}

// Tema svake vidljive sekcije: ručno odabrana, inače automatski izmjenjivanje
// Tema 1 / Tema 2 prema položaju među VIDLJIVIM sekcijama (1., 3., 5. = Tema 1; 2., 4. = Tema 2).
function getSectionThemes(site) {
  const r = resolveSite(site);
  const { order } = getSectionPlan(site);
  const out = {};
  order.forEach((id, i) => { out[id] = r.sections.themes[id] || (i % 2 === 0 ? 't1' : 't2'); });
  return out;
}

// Zamjena {{secTheme:<id>}} -> sec-t1 | sec-t2.
function applySectionThemes(html, site) {
  const themes = getSectionThemes(site);
  return html.replace(/\{\{secTheme:(\w+)\}\}/g, (_, id) => `sec-${themes[id] || 't1'}`);
}

// Pojedinačne sekcije u traženom redoslijedu (tokeni {{<id>.html}} koje popunjavaju mapperi).
function sectionTokens(site) {
  return getSectionPlan(site).order.map((id) => `{{${id}.html}}`).join('\n      ');
}

// Preslaži stavke izbornika prema redoslijedu i ukloni skrivene sekcije.
function arrangeNav(html, site) {
  const { order, hidden } = getSectionPlan(site);
  const re = /[ \t]*<li class="nav-item"><a class="nav-link" href="#(\w+)"[^>]*>[^<]*<\/a><\/li>\n?/g;
  const items = {};
  html = html.replace(re, (m, id) => { items[id] = m.trim(); return '\u0000NAV\u0000'; });
  let placed = false;
  html = html.replace(/\u0000NAV\u0000\s*/g, () => {
    if (placed) return '';
    placed = true;
    return order.filter((id) => items[id]).map((id) => '          ' + items[id]).join('\n') + '\n';
  });
  return html;
}

// ---------- Gumbi na naslovnici: HTML + prijevodi ----------
function bannerButtonList(site) {
  const r = resolveSite(site);
  const hidden = r.sections.hidden;
  return r.bannerButtons
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.type !== 'section' || !hidden.includes(b.section));
}

function renderBannerButtons(site) {
  return bannerButtonList(site).map(({ b, i }) => {
    const cls = `btn ${BTN_STYLES[b.style]}`;
    const customLabel = b.hr || b.en;
    let attrs, label;
    if (b.type === 'section') {
      attrs = `href="#${b.section}"`;
    } else {
      const external = /^https?:/i.test(b.url);
      attrs = `href="${escapeHtml(b.url)}"` + (external ? ' target="_blank" rel="noopener noreferrer"' : '');
    }
    if (customLabel) {
      label = `data-i18n="banner.b${i}">${escapeHtml(b.hr || b.en)}`;
    } else if (b.type === 'section') {
      label = `data-i18n="nav.${b.section}">{{t:nav.${b.section}}}`;
    } else {
      label = `data-i18n="banner.b${i}">${escapeHtml(b.url)}`;
    }
    return `<a ${attrs} class="${cls}" role="button" aria-pressed="true" ${label}</a>`;
  }).join('\n        ');
}

// Prijevodi za gumbe s vlastitim nazivom: { hr: { banner: { b0: '..' } }, en: { ... } }.
function bannerLocales(site) {
  const out = { hr: { banner: {} }, en: { banner: {} } };
  bannerButtonList(site).forEach(({ b, i }) => {
    const custom = b.hr || b.en;
    if (!custom && b.type === 'section') return;   // koristi nav.* prijevod
    const hr = b.hr || b.en || b.url || '';
    out.hr.banner[`b${i}`] = hr;
    out.en.banner[`b${i}`] = b.en || hr;
  });
  return out;
}

// ---------- Meta ----------
// Javna adresa weba (iz CNAME, kao GitHub Pages); bez CNAME -> zadana domena.
function siteUrl() {
  try {
    const host = fs.readFileSync(path.join(__dirname, '../../CNAME'), 'utf8').trim().split(/\s+/)[0];
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return `https://${host}/`;
  } catch { /* nema CNAME */ }
  return 'https://rasadnik-bernat.hr/';
}

// opts: { image: 'images/....' (relativno na root; za pregled pri dijeljenju linka) }
function applyMeta(html, site, opts = {}) {
  const m = resolveSite(site).meta;
  const base = siteUrl();
  const image = opts.image ? base + String(opts.image).replace(/^\.?\//, '').split('/').map(encodeURIComponent).join('/') : base + 'images/banner.jpg';
  return html
    .replaceAll('{{meta:title}}', () => escapeHtml(m.title))
    .replaceAll('{{meta:description}}', () => escapeHtml(m.description))
    .replaceAll('{{meta:image}}', () => escapeHtml(image))
    .replaceAll('{{meta:url}}', () => escapeHtml(base));
}

// Strukturirani podaci (schema.org LocalBusiness) za tražilice — iz Kontakta.
// Adresa u obliku "Ulica br, poštanski broj, mjesto" (kao u editoru); dijelovi koji nedostaju se izostave.
function buildJsonLd(contact = {}) {
  const base = siteUrl();
  const ld = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'Rasadnik Bernat', url: base.replace(/\/$/, '') };
  const tel = String(contact.number || '').replace(/[^\d+]/g, '');
  if (tel) ld.telephone = tel;
  if (contact.mail) ld.email = String(contact.mail).trim();
  const parts = String(contact.address || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length) {
    const addr = { '@type': 'PostalAddress', streetAddress: parts[0], addressCountry: 'HR' };
    const pc = parts.find((x) => /^\d{5}$/.test(x));
    if (pc) addr.postalCode = pc;
    const city = parts.slice(1).filter((x) => x !== pc).pop();
    if (city) addr.addressLocality = city;
    ld.address = addr;
  }
  if (/^https?:\/\//i.test(String(contact.mapUrl || ''))) ld.hasMap = contact.mapUrl;
  const same = (Array.isArray(contact.social) ? contact.social : []).map((s) => s && s.url).filter((u) => /^https?:\/\//i.test(String(u || '')));
  if (same.length) ld.sameAs = same;
  // JSON unutar <script>: "</" i "<!--" se ne smiju pojaviti doslovno.
  const json = JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

// ---------- CSS ----------
// Vraća CSS koji se dodaje na kraj css/index.css.
// images: { banner: 'images/....' } (relativno na root).
function buildSiteCss(site, images = {}) {
  const l = resolveSite(site).layout;
  let css = '';
  const banner = [];
  if (BANNER_HEIGHTS[l.bannerHeight] !== BANNER_HEIGHTS.tall) banner.push(`min-height:${BANNER_HEIGHTS[l.bannerHeight]}`);
  const bgParts = [];
  if (l.bannerOverlay > 0) bgParts.push(`linear-gradient(rgba(0,0,0,${(l.bannerOverlay / 100).toFixed(2)}),rgba(0,0,0,${(l.bannerOverlay / 100).toFixed(2)}))`);
  if (images.banner && images.banner !== 'images/banner-2.jpg') bgParts.push(`url(../${images.banner})`);
  else if (bgParts.length) bgParts.push('url(../images/banner-2.jpg)');
  if (bgParts.length) banner.push(`background-image:${bgParts.join(',')}`);
  if (banner.length) css += `.banner{${banner.join(';')};}\n`;

  const r = RADII[l.radius];
  if (r !== null && r !== undefined) {
    css += `.btn,.card,.product-card,.modal-content,.service-img,.about img,.gallery img,.preview-product-description,.dropdown-menu{border-radius:${r} !important;}\n`;
    css += `.product-card{--bs-card-border-radius:${r};--bs-card-inner-border-radius:calc(${r} - 1px);}\n`;
    css += `.product-img-wrap{border-top-left-radius:calc(${r} - 1px);border-top-right-radius:calc(${r} - 1px);}\n`;
    css += `.product-img-wrap .card-img-top{border-radius:0 !important;}\n`;
  }
  if (l.cardHover === false) css += '.product-card:hover{-webkit-transform:none;transform:none;}\n';
  const size = CARD_SIZES[l.cardSize];
  if (size) {
    const r = [];
    if (size.row) r.push(`#products .row{max-width:${size.row};margin-left:auto;margin-right:auto;}`);
    if (size.container) r.push(`#products .container{max-width:${size.container};}`);
    r.push(`.product-card .card-body{padding:${size.pad};}`);
    r.push(`.product-card .card-text{font-size:${size.text};}`);
    r.push(`.product-card .btn-product-details{font-size:${size.btn};}`);
    if (l.cardSize === 'xsmall') r.push('.product-card .anchor-price-container{font-size:.8rem;}');
    css += `@media (min-width:768px){${r.join('')}}\n`;
  }
  const ratio = IMAGE_RATIOS[l.imageRatio];
  if (ratio) css += `.product-card .card-img-top{aspect-ratio:${ratio};object-fit:cover;}\n`;
  const fsz = FONT_SIZES[l.fontSize];
  if (fsz) css += `html{font-size:${fsz};}\n`;
  return css;
}

// Bootstrap row-cols klase za red kartica sadnica (mobitel -> sm -> md -> lg).
// Zadano (4 / mobitel 2) daje isti raspored kao prije: 2 / 3 / 4.
function productRowColsClasses(site) {
  const l = resolveSite(site).layout;
  const c = PRODUCT_COLUMNS.includes(l.columns) ? l.columns : LAYOUT_DEFAULTS.columns;
  const m = MOBILE_COLUMNS.includes(l.mobileColumns) ? l.mobileColumns : LAYOUT_DEFAULTS.mobileColumns;
  const sm = Math.max(m, Math.min(c, c === 3 || c === 2 ? 2 : 3));
  const md = Math.min(c, 4);
  const cls = [`row-cols-${m}`, `row-cols-sm-${sm}`, `row-cols-md-${md}`];
  if (c > 4) cls.push(`row-cols-lg-${c}`);
  return cls.join(' ');
}

// ---------- Galerija ----------
function sortByOrder(names, order) {
  const ord = Array.isArray(order) ? order : [];
  const rank = (f) => { const i = ord.indexOf(f); return i === -1 ? Infinity : i; };
  return [...names].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
    return a.localeCompare(b);
  });
}

module.exports = {
  TEXT_FIELDS, TEXT_KEYS, SECTION_DEFS, SECTION_IDS, SECTION_THEMES, getSectionThemes, applySectionThemes, LAYOUT_DEFAULTS, META_DEFAULTS,
  BANNER_HEIGHTS, RADII, FONT_SIZES,
  getTextDefaults, applyTextOverrides, applyTextTokens, normalizeSite, resolveSite, readSite,
  getSectionPlan, renderBannerButtons, bannerLocales, BTN_STYLES, MAX_BANNER_BUTTONS, BANNER_DEFAULT, sectionTokens, arrangeNav, applyMeta, buildSiteCss, buildJsonLd, siteUrl, productRowColsClasses, PRODUCT_COLUMNS, MOBILE_COLUMNS, CARD_SIZES, IMAGE_RATIOS, sortByOrder, escapeHtml,
};
