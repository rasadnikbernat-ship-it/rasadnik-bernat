/**
 * Migracija data.xlsx -> data.json (jednokratno).
 *
 * data.json postaje glavni izvor podataka za editor i generator.
 * data.xlsx ostaje format za export/import (vidi editor "Excel" gumbe).
 *
 * Pokretanje: node generator/migrate-xlsx-to-json.js
 * (ili se poziva automatski iz editor/server.js ako data.json ne postoji)
 */
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('xlsx');

const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'data.xlsx');
const JSON_PATH = path.join(ROOT, 'data.json');

// Nazivi sheetova + redoslijed stupaca (prvi red u Excelu je zaglavlje -> range:1).
const SHEETS = {
  contact: ['number', 'mail', 'address', 'mapUrl', 'mapIframe'],
  products: ['hr_name', 'name', 'hr_description', 'description', 'price', 'anchorPrice', 'imageDir'],
  services: ['hr_name', 'name', 'hr_description', 'description', 'imageName'],
  about: ['hr_title', 'title', 'hr_description', 'description', 'imageName'],
};

// Pretvori Excel workbook u data.json objekt.
function workbookToData(wb) {
  const read = (sheet, headers) => {
    const ws = wb.Sheets[sheet];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: headers, range: 1, defval: '' });
  };

  const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
  // Cijena: broj ili prazno (null). Čuvamo kao string radi konzistentnosti s editorom.
  const numOrNull = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const contactRow = read('contact', SHEETS.contact)[0] || {};
  const contact = {
    number: str(contactRow.number),
    mail: str(contactRow.mail),
    address: str(contactRow.address),
    mapUrl: str(contactRow.mapUrl),
    mapIframe: str(contactRow.mapIframe),
  };

  const products = read('products', SHEETS.products)
    .filter((r) => str(r.hr_name) || str(r.name))
    .map((r) => ({
      hr_name: str(r.hr_name),
      name: str(r.name),
      hr_description: str(r.hr_description),
      description: str(r.description),
      price: numOrNull(r.price),
      anchorPrice: numOrNull(r.anchorPrice),
      imageDir: str(r.imageDir),
    }));

  const services = read('services', SHEETS.services)
    .filter((r) => str(r.hr_name) || str(r.name))
    .map((r) => ({
      hr_name: str(r.hr_name),
      name: str(r.name),
      hr_description: str(r.hr_description),
      description: str(r.description),
      imageName: str(r.imageName),
    }));

  const about = read('about', SHEETS.about)
    .filter((r) => str(r.hr_title) || str(r.title))
    .map((r) => ({
      hr_title: str(r.hr_title),
      title: str(r.title),
      hr_description: str(r.hr_description),
      description: str(r.description),
      imageName: str(r.imageName),
    }));

  return { contact, products, services, about };
}

function migrate() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`data.xlsx nije pronađen: ${XLSX_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_PATH);
  const data = workbookToData(wb);
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✓ data.json kreiran: ${JSON_PATH}`);
  console.log(`  proizvodi: ${data.products.length}, usluge: ${data.services.length}, o-nama: ${data.about.length}`);
  return data;
}

// Ako se pokreće direktno (ne require), odmah migriraj.
if (require.main === module) {
  try {
    migrate();
  } catch (err) {
    console.error('Migracija nije uspjela:', err.message);
    process.exit(1);
  }
}

module.exports = { migrate, workbookToData, SHEETS };
