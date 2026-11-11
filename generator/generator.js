const { readFile, writeFile } = require('node:fs/promises');
const { rmSync, mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const pretty = require('pretty');
const browserify = require('browserify');
const CleanCSS = require('clean-css');
const minify = require('html-minifier').minify;
const { mapCommonTemplates } = require('./common/common');
const { normalizeSocial } = require('./contact/social');
const { createLocales, removeCreatedLocales } = require('./locales/locales');
const { getData } = require('./data');
const { mapProductsTemplate } = require('./products/products');
const { mapServicesTemplate } = require('./services/services');
const { mapContactTemplate } = require('./contact/contact');
const { mapAboutTemplate } = require('./about/about');
const { mapGalleryTemplate } = require('./gallery/gallery');
const { generatePriceList } = require('./priceList/priceList');
const { buildThemeCss } = require('./common/theme');
const { renderBannerButtons, sectionTokens, getSectionPlan, applySectionThemes, arrangeNav, applyMeta, applyTextTokens, buildSiteCss, buildJsonLd } = require('./common/site');
const { getDefaultImagePath, getDefaultImageMime, getDefaultImageRel } = require('./common/defaults');
const config = require('../config.json');
const crypto = require('node:crypto');

const MINIFY_HTML = true;
const MINIFY_CSS = true;
const MINIFY_JS = true;

const indexHTMLTemplatePath = path.join(__dirname, './index.html');
const indexPath = path.join(__dirname, '../index.html');
const scriptTemplatePath = path.join(__dirname, './js/script.js');
const indexCSSTemplatePath = path.join(__dirname, './css/index.css');
// Ime skripte = hash sadržaja (stabilno dok se skripta ne promijeni; služi i kao cache-busting).
let scriptName = '';
let cssVersion = ''; // hash sadržaja css/index.css -> ?v=... u linku (cache-busting)
const scriptDirPath = path.join(__dirname, `../scripts`);
const cssIndexPath = path.join(__dirname, '../css/index.css');

(async () => {
  try {
    const data = getData();
    await createScripts(data); // prvo: treba hash imena skripte za index.html
    await createIndexCSS(); // prvo: treba hash za link u index.html
    await createIndexHTML(data);
    createDocs(data);
  } catch (err) {
    console.error(err);
  }
})();

async function createIndexHTML(data) {
  const { contact, products, services, about } = data;
  const site = config.site || {};
  // Redoslijed i vidljivost sekcija (Postavke -> Sekcije).
  const indexHTMLTemplate = (await readFile(indexHTMLTemplatePath, { encoding: 'utf8' }))
    .replaceAll('{{sections.html}}', sectionTokens(site));
  const { hidden } = getSectionPlan(site);
  let indexHTML = await mapCommonTemplates(indexHTMLTemplate);
  indexHTML = arrangeNav(indexHTML, site);
  indexHTML = await mapContactTemplate(indexHTML, contact);
  indexHTML = await mapProductsTemplate(indexHTML, products);
  indexHTML = await mapServicesTemplate(indexHTML, services);
  indexHTML = await mapAboutTemplate(indexHTML, about);
  if (!hidden.includes('gallery')) indexHTML = await mapGalleryTemplate(indexHTML);
  indexHTML = indexHTML.replaceAll('{{currency}}', () => escapeCurrency(config.priceList.currency)).replaceAll('{{scriptName}}', scriptName).replaceAll('{{cssVersion}}', cssVersion);
  // Slike (logo, favicon), meta podaci i tekstovi iz editora.
  indexHTML = indexHTML
    .replaceAll('{{img:logo}}', getDefaultImagePath('logo'))
    .replaceAll('{{img:favicon.type}}', getDefaultImageMime('favicon'))
    .replaceAll('{{img:favicon}}', getDefaultImagePath('favicon'));
  indexHTML = indexHTML.replaceAll('{{bannerButtons}}', () => renderBannerButtons(site));
  indexHTML = applySectionThemes(indexHTML, site);
  indexHTML = applyMeta(indexHTML, site, { image: getDefaultImageRel('banner') });
  // Kontakt (s istim zadanim poveznicama kao u sekciji Kontakt).
  indexHTML = indexHTML.replaceAll('{{jsonLd}}', () => buildJsonLd({ ...(contact || {}), social: normalizeSocial((contact || {}).social) }));
  indexHTML = applyTextTokens(indexHTML, site);
  await writeFile(indexPath, pretty(MINIFY_HTML ? minifyHTML(indexHTML) : indexHTML));
}

function minifyHTML(html) {
  return minify(html, {
    removeComments: true,
    removeCommentsFromCDATA: true,
    collapseWhitespace: true,
    collapseBooleanAttributes: true,
    removeAttributeQuotes: true,
    removeRedundantAttributes: true,
    useShortDoctype: true,
    removeEmptyAttributes: true,
  });
}

function escapeCurrency(c) {
  return String(c ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function createIndexCSS() {
  const cssIndex = await readFile(indexCSSTemplatePath, { encoding: 'utf8' });
  // Tema iz config.json (boje + font) — vidi common/theme.js.
  const { head, tail } = buildThemeCss(config.theme);
  const siteCss = buildSiteCss(config.site, { banner: getDefaultImageRel('banner') });
  const fullCss = head + cssIndex + '\n' + tail + siteCss;
  const outCss = MINIFY_CSS ? new CleanCSS({}).minify(fullCss).styles : fullCss;
  cssVersion = crypto.createHash('sha1').update(outCss).digest('hex').slice(0, 10);
  await writeFile(cssIndexPath, outCss);
}

async function createScripts(data) {
  const { contact, ...rest } = data;
  await createLocales(rest);
  try {
    await browserifyJS();
  } finally {
    await removeCreatedLocales();
  }
}

function createDocs(data) {
  const { products } = data;
  generatePriceList(products);
}

async function browserifyJS() {
  try {
    rmSync(scriptDirPath, { recursive: true, force: true });
    mkdirSync(scriptDirPath, { recursive: true });
    let jsMin = browserify(scriptTemplatePath);
    if (MINIFY_JS) jsMin = jsMin.transform(path.join(__dirname, './node_modules/@browserify/uglifyify'), { global: true });
    const code = await new Promise((resolve, reject) => {
      jsMin.bundle((err, buf) => (err ? reject(err) : resolve(buf)));
    });
    scriptName = `${crypto.createHash('sha1').update(code).digest('hex').slice(0, 16)}.js`;
    writeFileSync(path.join(scriptDirPath, scriptName), code);
  } catch (err) {
    console.error('Greška:', err);
    throw err;
  }
}