const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Stabilan id stavke iz njenog sadržaja (naziv + folder slika), ne iz položaja u popisu:
// dodavanje/premještanje jedne stavke ne mijenja id-eve ostalih (manje promjena u gitu, isti #modal linkovi).
// Duplikati (isti naziv i folder) dobivaju sufiks -2, -3, ...
function makeIdFactory(kind) {
  const seen = new Map();
  return (...parts) => {
    const base = `${kind}-${crypto.createHash('sha1').update(`${kind}:${parts.map((x) => x ?? '').join('|')}`).digest('hex').slice(0, 12)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

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
  const idFor = makeIdFactory('p');
  return products.map((item) => {
    let parsedPrice = parseFloat(item.price);
    // Svaki proizvod s cijenom ima sidrenu (ručno uređen data.json bez nje -> sidrena = cijena).
    let parsedAnchorPrice = parseFloat(item.anchorPrice);
    if (isNaN(parsedAnchorPrice)) parsedAnchorPrice = parsedPrice;
    return {
      ...item,
      id: idFor(item.hr_name, item.imageDir),
      price: isNaN(parsedPrice) ? undefined : parsedPrice.toFixed(2),
      anchorPrice: isNaN(parsedAnchorPrice) ? undefined : parsedAnchorPrice.toFixed(2),
    };
  });
}

function prepareServicesData(services) {
  const idFor = makeIdFactory('s');
  return services.map((item) => {
    return {
      ...item,
      id: idFor(item.hr_name, item.imageName),
      imageAlt: `${item.imageName ?? ''} - ${item.hr_name ?? ''}`,
    };
  });
}

function prepareAboutData(about) {
  const idFor = makeIdFactory('a');
  return about.map((item) => {
    return {
      ...item,
      id: idFor(item.hr_title, item.imageName),
      imageAlt: `${item.imageName ?? ''} - ${item.hr_title ?? ''}`,
    };
  });
}

module.exports = {
  getData,
};
