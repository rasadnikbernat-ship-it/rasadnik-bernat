// Zadane slike (kad stavka nema vlastitu). Moguće ih je promijeniti u editoru (Postavke -> Zadane slike);
// putanja se tada zapiše u config.json -> defaultImages[kind]. Bez toga vrijede ugrađene slike.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

const BUILT_IN = {
  services: 'images/usluga-placeholder.svg',
  about: 'images/o-nama-placeholder.svg',
  products: 'images/nema-slike.png',
  logo: 'images/logo.png',
  favicon: 'images/favicon.ico',
  banner: 'images/banner-2.jpg',
};

// Dozvoljeni tipovi po vrsti (logo ide i u PDF cjenik -> samo png/jpg).
const ALLOWED_EXT = {
  services: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  about: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  products: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  logo: ['.png', '.jpg', '.jpeg'],
  favicon: ['.ico', '.png'],
  banner: ['.jpg', '.jpeg', '.png', '.webp'],
};

const MIME = { '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function getDefaultImageRel(kind) {
  let custom = '';
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    custom = ((cfg.defaultImages || {})[kind]) || '';
  } catch { /* bez configa -> ugrađena */ }
  if (custom && /^images\/defaults\/[^/\\]+$/.test(custom) && fs.existsSync(path.join(ROOT, custom))) return custom;
  return BUILT_IN[kind];
}

// Putanja za HTML weba (relativno na root).
function getDefaultImagePath(kind) {
  return './' + getDefaultImageRel(kind);
}

function getDefaultImageMime(kind) {
  return MIME[path.extname(getDefaultImageRel(kind)).toLowerCase()] || 'application/octet-stream';
}

module.exports = { getDefaultImagePath, getDefaultImageRel, getDefaultImageMime, BUILT_IN, ALLOWED_EXT };
