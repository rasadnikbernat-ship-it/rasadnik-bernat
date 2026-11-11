// Tema weba (boje + font) — jedan izvor istine za generator i editor.
// Vrijednosti se čuvaju u config.json -> theme: { colors: { <key>: "#rrggbb" }, font: "<id>" }.
// Zapisuju se samo odstupanja od zadanih; generator ih dodaje na kraj css/index.css.

// group: naslov grupe u editoru. defFrom: zadana vrijednost prati drugu boju (dok je korisnik ne postavi).
// Zadani CSS (css/index.css :root) mora imati isti lanac var(--...), da izgled bez postavki ostane isti.
const COLORS = [
  // --- Osnovne boje
  { group: 'Osnovne boje', key: 'primary',    cssVar: '--primary-color',    label: 'Glavna boja', hint: 'Zadana boja glavnog gumba i Teme 2 (naglašene sekcije)',           def: '#5e8546' },
  { group: 'Osnovne boje', key: 'primary2',   cssVar: '--primary-color-2',  label: 'Glavna boja — hover', hint: 'Zadani hover glavnog gumba',          def: '#738c39' },
  { group: 'Osnovne boje', key: 'secondary',  cssVar: '--secondary-color',  label: 'Sekundarna boja', hint: 'Okvir kartica; zadana boja sekundarnog gumba i gumba na kartici',    def: '#477e5f' },
  { group: 'Osnovne boje', key: 'secondary2', cssVar: '--secondary-color-2', label: 'Sekundarna — hover', hint: 'Zadani hover sekundarnog gumba i gumba na kartici',          def: '#65af85' },
  { group: 'Osnovne boje', key: 'tertiary',   cssVar: '--tertiary-color',   label: 'Tekst (tamna)', hint: 'Tekst, naslovi, navigacija i podnožje; zadani tekst Teme 1',         def: '#102a27' },
  { group: 'Osnovne boje', key: 'tertiary2',  cssVar: '--tertiary-color-2', label: 'Tekst — hover', hint: 'Hover navigacije i poveznica Teme 1',       def: '#27645d' },
  { group: 'Osnovne boje', key: 'quaternary', cssVar: '--quaternary-color', label: 'Pozadina navigacije i podnožja', hint: 'Svijetla pozadina; zadani hover poveznica Teme 2',            def: '#edf4ec' },
  { group: 'Osnovne boje', key: 'white',      cssVar: '--white-color',      label: 'Svijetla', hint: 'Svijetli tekst na tamnoj podlozi (baner, gumbi, Tema 2)',   def: '#ffffff' },

  // --- Gumbi (tri razine)
  { group: 'Gumbi', key: 'btn1Bg',    cssVar: '--btn1-bg',    label: 'Glavni gumb — pozadina',       hint: 'Gumb na naslovnici (npr. "Sadnice"), "OK" kolačića', def: '#5e8546', defFrom: 'primary' },
  { group: 'Gumbi', key: 'btn1Hover', cssVar: '--btn1-hover', label: 'Glavni gumb — hover', hint: 'Boja pozadine kad se prijeđe mišem',                               def: '#738c39', defFrom: 'primary2' },
  { group: 'Gumbi', key: 'btn1Text',  cssVar: '--btn1-text',  label: 'Glavni gumb — tekst i rub', hint: 'Boja teksta i obruba gumba',                                                   def: '#ffffff', defFrom: 'white' },
  { group: 'Gumbi', key: 'btn2Bg',    cssVar: '--btn2-bg',    label: 'Sekundarni gumb — pozadina',   hint: 'Drugi gumb na naslovnici (npr. "Usluge")',           def: '#477e5f', defFrom: 'secondary' },
  { group: 'Gumbi', key: 'btn2Hover', cssVar: '--btn2-hover', label: 'Sekundarni gumb — hover', hint: 'Boja pozadine kad se prijeđe mišem',                                                   def: '#65af85', defFrom: 'secondary2' },
  { group: 'Gumbi', key: 'btn2Text',  cssVar: '--btn2-text',  label: 'Sekundarni gumb — tekst i rub', hint: 'Boja teksta i obruba gumba',                                                  def: '#ffffff', defFrom: 'white' },
  { group: 'Gumbi', key: 'btn3Bg',    cssVar: '--btn3-bg',    label: 'Gumb na kartici — pozadina',   hint: 'Gumb "Opširnije" na karticama sadnica',              def: '#477e5f', defFrom: 'secondary' },
  { group: 'Gumbi', key: 'btn3Hover', cssVar: '--btn3-hover', label: 'Gumb na kartici — hover', hint: 'Boja pozadine kad se prijeđe mišem',                                                   def: '#65af85', defFrom: 'secondary2' },
  { group: 'Gumbi', key: 'btn3Text',  cssVar: '--btn3-text',  label: 'Gumb na kartici — tekst i rub', hint: 'Boja teksta i obruba gumba',                                                  def: '#ffffff', defFrom: 'white' },

  // --- Teme sekcija
  { group: 'Tema 1 — svijetla sekcija', key: 't1Bg',        cssVar: '--t1-bg',         label: 'Pozadina',          hint: 'Zadano svijetlo siva',        def: '#f8f9fa' },
  { group: 'Tema 1 — svijetla sekcija', key: 't1Text',      cssVar: '--t1-text',       label: 'Tekst',             hint: '',                            def: '#102a27', defFrom: 'tertiary' },
  { group: 'Tema 1 — svijetla sekcija', key: 't1Heading',   cssVar: '--t1-heading',    label: 'Naslovi',           hint: 'Prati tekst dok ne odabereš', def: '#102a27', defFrom: 't1Text' },
  { group: 'Tema 1 — svijetla sekcija', key: 't1Link',      cssVar: '--t1-link',       label: 'Poveznice',         hint: 'npr. telefon, e-mail',        def: '#102a27', defFrom: 'tertiary' },
  { group: 'Tema 1 — svijetla sekcija', key: 't1LinkHover', cssVar: '--t1-link-hover', label: 'Poveznice — hover', hint: '',                            def: '#27645d', defFrom: 'tertiary2' },

  { group: 'Tema 2 — naglašena sekcija', key: 't2Bg',        cssVar: '--t2-bg',         label: 'Pozadina',          hint: 'Zadano glavna boja',          def: '#5e8546', defFrom: 'primary' },
  { group: 'Tema 2 — naglašena sekcija', key: 't2Text',      cssVar: '--t2-text',       label: 'Tekst',             hint: '',                            def: '#ffffff', defFrom: 'white' },
  { group: 'Tema 2 — naglašena sekcija', key: 't2Heading',   cssVar: '--t2-heading',    label: 'Naslovi',           hint: 'Prati tekst dok ne odabereš', def: '#ffffff', defFrom: 't2Text' },
  { group: 'Tema 2 — naglašena sekcija', key: 't2Link',      cssVar: '--t2-link',       label: 'Poveznice',         hint: '',                            def: '#ffffff', defFrom: 't2Text' },
  { group: 'Tema 2 — naglašena sekcija', key: 't2LinkHover', cssVar: '--t2-link-hover', label: 'Poveznice — hover', hint: '',                            def: '#edf4ec', defFrom: 'quaternary' },

  // --- Kartice
  { group: 'Kartice sadnica', key: 'cardBg',   cssVar: '--card-bg',   label: 'Pozadina kartice', hint: '',  def: '#ffffff' },
  { group: 'Kartice sadnica', key: 'cardText', cssVar: '--card-text', label: 'Tekst kartice',    hint: 'Naziv i cijena', def: '#102a27', defFrom: 'tertiary' },

  // --- Zaglavlje i podnožje
  { group: 'Zaglavlje (izbornik)', key: 'navBg',    cssVar: '--nav-bg',    label: 'Pozadina izbornika', hint: 'Traka na vrhu stranice',            def: '#edf4ec', defFrom: 'quaternary' },
  { group: 'Zaglavlje (izbornik)', key: 'navText',  cssVar: '--nav-text',  label: 'Tekst izbornika',    hint: 'Poveznice i oznaka jezika',          def: '#102a27', defFrom: 'tertiary' },
  { group: 'Zaglavlje (izbornik)', key: 'navHover', cssVar: '--nav-hover', label: 'Izbornik — hover',   hint: 'Kad se prijeđe mišem',               def: '#27645d', defFrom: 'tertiary2' },
  { group: 'Podnožje', key: 'footerBg',   cssVar: '--footer-bg',   label: 'Pozadina podnožja', hint: '',  def: '#edf4ec', defFrom: 'quaternary' },
  { group: 'Podnožje', key: 'footerText', cssVar: '--footer-text', label: 'Tekst podnožja',    hint: '',  def: '#102a27', defFrom: 'tertiary' },

  // --- Ostalo
  { group: 'Ostalo', key: 'cookieBg',   cssVar: '--cookie-bg',   label: 'Baner kolačića — pozadina', hint: 'Traka na dnu stranice', def: '#102a27' },
  { group: 'Ostalo', key: 'cookieText', cssVar: '--cookie-text', label: 'Baner kolačića — tekst',    hint: '',                      def: '#ffffff' },
  { group: 'Ostalo', key: 'soldOut',    cssVar: '--sold-out-color', label: 'Oznaka "Rasprodano"',    hint: 'Pločica preko slike sadnice', def: '#a01414' },
];

const SYSTEM_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const FONTS = [
  { id: 'default',    label: 'Zadano (kako je sada)', stack: null },
  { id: 'system',     label: 'Sistemski font', stack: SYSTEM_STACK },
  { id: 'open-sans',  label: 'Open Sans',   family: 'Open Sans',   stack: '"Open Sans", sans-serif', web: true },
  { id: 'roboto',     label: 'Roboto',      family: 'Roboto',      stack: 'Roboto, sans-serif', web: true },
  { id: 'lato',       label: 'Lato',        family: 'Lato',        stack: 'Lato, sans-serif', web: true },
  { id: 'merriweather', label: 'Merriweather (serif)', family: 'Merriweather', stack: 'Merriweather, Georgia, serif', web: true },
];

const RANGES = {
  'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function findFont(id) {
  return FONTS.find((f) => f.id === id) || FONTS[0];
}

// Očisti ulaz: samo poznati ključevi, valjani hex, poznati font; zadane vrijednosti se izostave.
function normalizeTheme(raw) {
  const out = {};
  const colors = {};
  const src = (raw && raw.colors) || {};
  COLORS.forEach((c) => {
    const v = typeof src[c.key] === 'string' ? src[c.key].trim().toLowerCase() : '';
    // Boje s defFrom prate drugu boju, pa se čuva svaka eksplicitno odabrana vrijednost.
    if (HEX.test(v) && (c.defFrom || v !== c.def)) colors[c.key] = v;
  });
  if (Object.keys(colors).length) out.colors = colors;
  const font = raw && typeof raw.font === 'string' ? findFont(raw.font) : FONTS[0];
  if (font.id !== 'default') out.font = font.id;
  return out;
}

// @font-face pravila za font (urlPrefix npr. "../fonts/").
function buildFontFaces(fontId, urlPrefix) {
  const f = findFont(fontId);
  if (!f.web) return '';
  let css = '';
  ['latin-ext', 'latin'].forEach((subset) => {
    [400, 700].forEach((weight) => {
      css += `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${weight};font-display:swap;` +
        `src:url("${urlPrefix}${f.id}-${subset}-${weight}.woff2") format("woff2");unicode-range:${RANGES[subset]};}\n`;
    });
  });
  return css;
}

function relLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// Stvarna boja: odabrana, inače zadana koja prati drugu boju (defFrom).
function resolveColor(theme, key) {
  const c = COLORS.find((x) => x.key === key);
  const v = theme && theme.colors && theme.colors[key];
  if (v) return v;
  return c.defFrom ? resolveColor(theme, c.defFrom) : c.def;
}

// CSS koji se dodaje oko predloška: font-face na početak, :root/body prepisivanje na kraj.
function buildThemeCss(theme, urlPrefix = '../fonts/') {
  const t = normalizeTheme(theme || {});
  const font = findFont(t.font);
  const head = buildFontFaces(font.id, urlPrefix);
  let tail = '';
  const vars = COLORS.filter((c) => t.colors && t.colors[c.key]).map((c) => `${c.cssVar}:${t.colors[c.key]};`);
  if (vars.length) tail += `:root{${vars.join('')}}\n`;
  // Tamna pozadina izbornika: ikona hamburger izbornika (mobitel) mora biti svijetla.
  const navBg = resolveColor(t, 'navBg');
  if (relLuminance(navBg) < 0.4) {
    tail += '.navbar-toggler{border-color:rgba(255,255,255,.55);}\n.navbar-toggler-icon{filter:invert(1);}\n';
  }
  if (font.stack) tail += `body{font-family:${font.stack};}\n`;
  return { head, tail };
}

module.exports = { COLORS, FONTS, RANGES, HEX, findFont, normalizeTheme, buildFontFaces, buildThemeCss };
