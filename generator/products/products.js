const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { getDefaultImagePath } = require('../common/defaults');
const { productRowColsClasses, readSite, escapeHtml } = require('../common/site');

const productsTemplatePath = path.join(__dirname, './templates/products.html');
const productCarouselSlideBtnTemplatePath = path.join(__dirname, './templates/product-carousel-slide-btn.html');
const productCarouselItemTemplatePath = path.join(__dirname, './templates/product-carousel-item.html');
const productTemplatePath = path.join(__dirname, './templates/product.html');
const priceOnReqTemplatePath = path.join(__dirname, './templates/price-on-req.html');
const priceTemplatePath = path.join(__dirname, './templates/price.html');
const anchorPriceTemplatePath = path.join(__dirname, './templates/anchorPrice.html');
const imagesRootDir = path.join(__dirname, '../../images/products');
const imagesPath = './images/products';

async function mapProductsTemplate(html, products) {
  const productHTMLs = await getProductHTMLs(products);
  const productsTemplate = await readFile(productsTemplatePath, { encoding: 'utf8' });
  const productsHTML = productsTemplate
    .replaceAll('{{productRowCols}}', () => productRowColsClasses(readSite()))
    .replaceAll('{{products}}', () => productHTMLs.join('\n'));
  html = html.replaceAll('{{products.html}}', () => productsHTML);
  return html;
}

async function getProductHTMLs(products) {
  const templates = await getTemplates();
  return Promise.all(products.map(item => getProductHTML(item, templates)));
}

async function getTemplates() {
  const [
    productCarouselSlideBtnTemplate,
    productCarouselItemTemplate,
    productTemplate,
    priceOnReqTemplate,
    priceTemplate,
    anchorPriceTemplate
  ] = await Promise.all([
    readFile(productCarouselSlideBtnTemplatePath, { encoding: 'utf8' }),
    readFile(productCarouselItemTemplatePath, { encoding: 'utf8' }),
    readFile(productTemplatePath, { encoding: 'utf8' }),
    readFile(priceOnReqTemplatePath, { encoding: 'utf8' }),
    readFile(priceTemplatePath, { encoding: 'utf8' }),
    readFile(anchorPriceTemplatePath,  { encoding: 'utf8' })
  ]);
  return { productCarouselSlideBtnTemplate, productCarouselItemTemplate, productTemplate, priceOnReqTemplate, priceTemplate, anchorPriceTemplate };
}

async function getProductHTML(item, htmlTemplates) {
  const { productCarouselSlideBtnTemplate, productCarouselItemTemplate, productTemplate, priceOnReqTemplate, priceTemplate, anchorPriceTemplate } = htmlTemplates;
  const carouselButtons = [];
  const carouselItems = [];
  let fileNames = [];
  try {
    // Samo ime foldera (bez putanje) — ručno pokvaren data.json ne smije čitati izvan images/products.
    const dir = String(item.imageDir || '');
    if (!dir || dir.startsWith('.') || /[\\/]/.test(dir)) throw new Error('invalid imageDir');
    fileNames = (await readdir(path.join(imagesRootDir, dir))).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
    fileNames = sortByImageOrder(fileNames, item.imageOrder);
  } catch (err) {
    // image directory doesn't exist — fall back to placeholder image
  }
  let imageTop = {};
  if (fileNames.length > 0) {
    fileNames.forEach((fileName, index) => {
      const alt = getImageAlt(fileName, item.hr_name);
      const imagePath = getImagePath(item.imageDir, fileName);
      if (index === 0) imageTop = { imagePath, alt };
      carouselButtons.push(getCarouselBtn(item, alt, index, productCarouselSlideBtnTemplate));
      carouselItems.push(getCarouselItem(imagePath, alt, index, productCarouselItemTemplate));
    });
  } else {
    imageTop = { imagePath: getDefaultImagePath('products'), alt: item.hr_name };
    carouselButtons.push(getCarouselBtn(item, imageTop.alt, 0, productCarouselSlideBtnTemplate));
    carouselItems.push(getCarouselItem(imageTop.imagePath, imageTop.alt, 0, productCarouselItemTemplate));
  }
  const priceHtml = item.price ? priceTemplate.replaceAll('{{price}}', () => escapeHtml(item.price)) : priceOnReqTemplate;
  const anchorPriceHtml = item.anchorPrice ? anchorPriceTemplate.replaceAll('{{anchorPrice}}', () => escapeHtml(item.anchorPrice)) : '-';
  return productTemplate
    .replaceAll('{{id}}', () => item.id)
    .replaceAll('{{name}}', () => escapeHtml(item.hr_name))
    .replaceAll('{{description}}', () => escapeHtml(item.hr_description))
    .replaceAll('{{soldOutClass}}', () => item.soldOut === true ? ' sold-out' : '')
    .replaceAll('{{soldOut.html}}', () => item.soldOut === true ? '<div class="sold-out-overlay"><span data-i18n="product.soldOut">{{t:product.soldOut}}</span></div>' : '')
    .replaceAll('{{price.html}}', () => priceHtml)
    .replaceAll('{{anchorPrice.html}}', () => anchorPriceHtml)
    .replaceAll('{{imageTop}}', () => escapeHtml(imageTop.imagePath))
    .replaceAll('{{imageTopAlt}}', () => escapeHtml(imageTop.alt))
    .replaceAll('{{carouselButtons}}', () => carouselButtons.join('\n'))
    .replaceAll('{{carouselItems}}', () => carouselItems.join('\n'));
}

// Slike iz imageOrder idu prve (tim redom; prva = naslovna na kartici),
// ostale (nove / neuvrštene) slijede abecedno.
function sortByImageOrder(fileNames, imageOrder) {
  const order = Array.isArray(imageOrder) ? imageOrder : [];
  const rank = (f) => { const i = order.indexOf(f); return i === -1 ? Infinity : i; };
  return [...fileNames].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
    return a.localeCompare(b);
  });
}

function getCarouselBtn(item, productAriaLabel, slide, template) {
  return template
    .replaceAll('{{id}}', () => item.id)
    .replaceAll('{{slide}}', () => slide)
    .replaceAll('{{productAriaLabel}}', () => escapeHtml(productAriaLabel))
    .replaceAll('{{active}}', () => slide === 0 ? 'class="active" aria-current="true"' : '');
}

function getCarouselItem(imagePath, alt, slide, template) {
  return template
    .replaceAll('{{carouselItemSrc}}', () => escapeHtml(imagePath))
    .replaceAll('{{alt}}', () => escapeHtml(alt))
    .replaceAll('{{active}}', () => slide === 0 ? 'active' : '');
}

function getImagePath(imageDir, fileName) {
  return `${imagesPath}/${imageDir}/${fileName}`;
}

function getImageAlt(fileName, name) {
  return `${name} | ${fileName}`;
}

module.exports = {
  mapProductsTemplate
};