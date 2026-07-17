const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');

const productsTemplatePath = path.join(__dirname, './templates/products.html');
const productCarouselSlideBtnTemplatePath = path.join(__dirname, './templates/product-carousel-slide-btn.html');
const productCarouselItemTemplatePath = path.join(__dirname, './templates/product-carousel-item.html');
const productTemplatePath = path.join(__dirname, './templates/product.html');
const priceOnReqTemplatePath = path.join(__dirname, './templates/price-on-req.html');
const priceTemplatePath = path.join(__dirname, './templates/price.html');
const imagesRootDir = path.join(__dirname, '../../images/products');
const imagesPath = './images/products'

async function mapProductsTemplate(html, products) {
  const productHTMLs = await getProductHTMLs(products);
  const productsTemplate = await readFile(productsTemplatePath, { encoding: 'utf8' });
  const productsHTML = productsTemplate.replaceAll('{{products}}', productHTMLs.join('\n'));
  html = html.replaceAll('{{products.html}}', productsHTML);
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
    priceTemplate
  ] = await Promise.all([
    readFile(productCarouselSlideBtnTemplatePath, { encoding: 'utf8' }),
    readFile(productCarouselItemTemplatePath, { encoding: 'utf8' }),
    readFile(productTemplatePath, { encoding: 'utf8' }),
    readFile(priceOnReqTemplatePath, { encoding: 'utf8' }),
    readFile(priceTemplatePath, { encoding: 'utf8' })
  ]);
  return { productCarouselSlideBtnTemplate, productCarouselItemTemplate, productTemplate, priceOnReqTemplate, priceTemplate };
}

async function getProductHTML(item, htmlTemplates) {
  const { productCarouselSlideBtnTemplate, productCarouselItemTemplate, productTemplate, priceOnReqTemplate, priceTemplate } = htmlTemplates;
  const carouselButtons = [];
  const carouselItems = [];
  let fileNames = [];
  try {
    fileNames = await readdir(`${imagesRootDir}/${item.imageDir}`);
  } catch(err) {
    //console.error(err);
  }
  let imageTop = {};
  if (fileNames.length > 0) {
    fileNames.forEach((fileName, index) => {
      const alt = getImageAlt(fileName, item.hr_name);
      const imagePath = getImagePath(item.imageDir, fileName);
      if (index == 0) imageTop = { imagePath, alt };
      carouselButtons.push(getCarouselBtn(item, alt, index, productCarouselSlideBtnTemplate));
      carouselItems.push(getCarouselItem(imagePath, alt, index, productCarouselItemTemplate))
    });
  } else {
    imageTop = { imagePath: './images/nema-slike.png', alt: item.hr_name };
    carouselButtons.push(getCarouselBtn(item, imageTop.alt, 0, productCarouselSlideBtnTemplate));
    carouselItems.push(getCarouselItem(imageTop.imagePath, imageTop.alt, 0, productCarouselItemTemplate))
  }
  const priceHtml = item.price ? priceTemplate.replaceAll('{{price}}', item.price) : priceOnReqTemplate;
  return productTemplate
    .replaceAll('{{id}}', item.id)
    .replaceAll('{{name}}', item.hr_name)
    .replaceAll('{{description}}', item.hr_description)
    .replaceAll('{{price.html}}', priceHtml)
    .replaceAll('{{imageTop}}', imageTop.imagePath)
    .replaceAll('{{imageTopAlt}}', imageTop.alt)
    .replaceAll('{{carouselButtons}}', carouselButtons.join('\n'))
    .replaceAll('{{carouselItems}}', carouselItems.join('\n'))
}

function getCarouselBtn(item, productAriaLabel, slide, template) {
  return template
    .replaceAll('{{id}}', item.id)
    .replaceAll('{{slide}}', slide)
    .replaceAll('{{productAriaLabel}}', productAriaLabel)
    .replaceAll('{{active}}', slide === 0 ? 'class="active" aria-current="true"' : '');
}

function getCarouselItem(imagePath, alt, slide, template) {
  return template
    .replaceAll('{{carouselItemSrc}}', imagePath)
    .replaceAll('{{alt}}', alt)
    .replaceAll('{{active}}', slide === 0 ? 'active' : '');
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