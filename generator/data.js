const path = require('node:path');
const fs = require('node:fs');
const { v4: uuidv4 } = require('uuid');

// data.json je glavni izvor podataka (uređuje se kroz editor).
// data.xlsx ostaje format za export/import (vidi editor/server.js).
const dataJsonPath = path.join(__dirname, '../data.json');

function getData() {
  const data = readDataJson();

  return {
    contact: data.contact,
    products: prepareProductsData(data.products),
    services: prepareServicesData(data.services),
    about: prepareAboutData(data.about),
  };
}

function readDataJson() {
  if (!fs.existsSync(dataJsonPath)) {
    throw new Error(`data.json nije pronađen: ${dataJsonPath}. Pokreni: node generator/migrate-xlsx-to-json.js`);
  }
  const raw = fs.readFileSync(dataJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    contact: parsed.contact || {},
    products: Array.isArray(parsed.products) ? parsed.products : [],
    services: Array.isArray(parsed.services) ? parsed.services : [],
    about: Array.isArray(parsed.about) ? parsed.about : [],
  };
}

function prepareProductsData(products) {
  return products.map(item => {
    let parsedPrice = parseFloat(item.price);
    let parsedAnchorPrice = parseFloat(item.anchorPrice);
    return {
      ...item,
      id: uuidv4(),
      price: isNaN(parsedPrice) ? undefined : parsedPrice.toFixed(2),
      anchorPrice: isNaN(parsedAnchorPrice) ? undefined : parsedAnchorPrice.toFixed(2),
    };
  });
}

function prepareServicesData(services) {
  return services.map(item => {
    return {
      ...item,
      id: uuidv4(),
      imageAlt: `${item.imageName ?? ''} - ${item.hr_name ?? ''}`,
    };
  });
}

function prepareAboutData(about) {
  return about.map(item => {
    return {
      ...item,
      id: uuidv4(),
      imageAlt: `${item.imageName ?? ''} - ${item.hr_title ?? ''}`,
    };
  });
}

module.exports = {
  getData,
};
