const { readFile, writeFile } = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const pretty = require('pretty');
const browserify = require('browserify');
const CleanCSS = require('clean-css');
const minify = require('html-minifier').minify;
const { mapCommonTemplates } = require('./common/common');
const { createLocales, removeCreatedLocales } = require('./locales/locales');
const { getData } = require('./data');
const { mapProductsTemplate } = require('./products/products');
const { mapServicesTemplate } = require('./services/services');
const { mapContactTemplate } = require('./contact/contact');
const { mapAboutTemplate } = require('./about/about');
const { mapGalleryTemplate } = require('./gallery/gallery');

const MINIFY_HTML = true;
const MINIFY_CSS = true;
const MINIFY_JS = true;

const indexHTMLTemplatePath = path.join(__dirname, './index.html');
const indexPath = path.join(__dirname, '../index.html');
const scriptTemplatePath = path.join(__dirname, './js/script.js');
const indexCSSTemplatePath = path.join(__dirname, './css/index.css');
const scriptPath = path.join(__dirname, '../scripts/script.js');
const cssIndexPath = path.join(__dirname, '../css/index.css');

(async () => {
  try {
    const data = getData();
    await createIndexHTML(data);
    await createIndexCSS();
    await createScripts(data);
  } catch (err) {
    console.error(err);
  }
})();

async function createIndexHTML(data) {
  const { contact, products, services, about } = data;
  const indexHTMLTemplate = await readFile(indexHTMLTemplatePath, { encoding: 'utf8' });
  let indexHTML = await mapCommonTemplates(indexHTMLTemplate);
  indexHTML = await mapContactTemplate(indexHTML, contact);
  indexHTML = await mapProductsTemplate(indexHTML, products);
  indexHTML = await mapServicesTemplate(indexHTML, services);
  indexHTML = await mapAboutTemplate(indexHTML, about);
  indexHTML = await mapGalleryTemplate(indexHTML);
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
  })
}

async function createIndexCSS() {
  const cssIndex = await readFile(indexCSSTemplatePath, { encoding: 'utf8' });
  await writeFile(cssIndexPath, MINIFY_CSS ? new CleanCSS({}).minify(cssIndex).styles : cssIndex);
}

async function createScripts(data) {
  const { contact, ...rest } = data;
  await createLocales(rest);
  await browserifyJS();
}

async function browserifyJS() {
  let jsMin = browserify(scriptTemplatePath);
  if (MINIFY_JS) jsMin = jsMin.transform(path.join(__dirname, './node_modules/@browserify/uglifyify'), { global: true });
  const ws = createWriteStream(scriptPath);
  jsMin.bundle().pipe(ws);
  await new Promise((resolve, reject) => {
    ws.on('finish', () => {
      removeCreatedLocales();
      resolve();
    }).on('error', err => {
      reject(err);
    });
  });
}