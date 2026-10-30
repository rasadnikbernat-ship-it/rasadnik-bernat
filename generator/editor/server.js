/**
 * Rasadnik Bernat — editor server (lokalni).
 *
 * Pokretanje: npm start  (iz root foldera projekta)  ili  ./start.sh
 *
 * Značajke:
 *  - Smart port: ako je zadani port slobodan -> koristi ga. Ako na njemu već radi
 *    NAŠ editor (prepoznaje se preko /__ping__) -> samo otvori browser. Ako je
 *    port zauzet nečim drugim -> prelazi na sljedeći slobodan.
 *  - Auto-open browsera nakon pokretanja.
 *  - API: čitanje/pisanje data.json (contact, products, services, about),
 *    čitanje/pisanje config.json (cjenik hr/en), upload slika (proizvodi/usluge/
 *    o-nama/galerija), brisanje galerijskih slika, export/import data.xlsx,
 *    pokretanje build-a (generiranje weba) i preview generirane stranice.
 *
 * Koristi samo Node core module + 'xlsx' (već je ovisnost generatora).
 */
const http = require('node:http');
const { spawn, exec } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const ROOT = path.join(__dirname, '..', '..'); // project root (rasadnik-bernat/)
const GENERATOR_DIR = path.join(__dirname, '..'); // generator/
const EDITOR_DIR = __dirname; // generator/editor/
const DATA_JSON = path.join(ROOT, 'data.json');
const DATA_XLSX = path.join(ROOT, 'data.xlsx');
const CONFIG_JSON = path.join(ROOT, 'config.json');

// Direktoriji slika po sekcijama.
const IMG_PRODUCTS = path.join(ROOT, 'images', 'products');     // images/products/<imageDir>/<file>
const IMG_SERVICES = path.join(ROOT, 'images', 'services');     // images/services/<file>
const IMG_ABOUT = path.join(ROOT, 'images', 'about');           // images/about/<file>
const IMG_GALLERY = path.join(ROOT, 'images', 'gallery', 'images'); // images/gallery/images/<file>
const PLACEHOLDER = path.join(ROOT, 'images', 'nema-slike.png');

const SERVER_SIGNATURE = 'rasadnik-bernat-editor';
const START_PORT = Number(process.env.EDITOR_PORT) || 4330;
const MAX_PORT_TRIES = 20;

// Nazivi Excel sheetova i redoslijed stupaca (zaglavlja).
const XLSX_HEADERS = {
  contact: ['number', 'mail', 'address', 'map url', 'map iframe'],
  products: ['naziv', 'name', 'opis', 'description', 'price', 'anchorPrice', 'image dir'],
  services: ['naziv', 'name', 'opis', 'description', 'image'],
  about: ['naziv', 'title', 'opis', 'description', 'image'],
};

// ---------- Pomoćne funkcije ----------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(req, limitBytes = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('Tijelo zahtjeva prelazi dopušteni limit.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const numOrNull = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};

// Sigurno rješavanje statičke putanje (spriječi path traversal).
function resolveStatic(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const full = path.join(EDITOR_DIR, rel);
  if (!full.startsWith(EDITOR_DIR)) return null;
  return full;
}

// Sigurno rješavanje putanje za PREVIEW (poslužuje generirani web iz ROOT-a).
function resolvePreview(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let rel = clean.replace(/^\/preview\/?/, '');
  if (rel === '') rel = 'index.html';
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null;
  const forbidden = [path.join(ROOT, 'generator'), path.join(ROOT, '.git'), path.join(ROOT, 'node_modules')];
  if (forbidden.some((f) => full === f || full.startsWith(f + path.sep))) return null;
  return full;
}

// Sanitizacija naziva slike + dozvoljena ekstenzija.
function safeImageName(name) {
  const base = path.basename(String(name || '')).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const ext = path.extname(cleaned);
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return null;
  return cleaned || null;
}

// Sanitizacija naziva foldera (imageDir za proizvode).
function safeDirName(name) {
  const base = path.basename(String(name || '')).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || null;
}

// ---------- data.json ----------

function emptyData() {
  return {
    contact: { number: '', mail: '', address: '', mapUrl: '', mapIframe: '' },
    products: [],
    services: [],
    about: [],
  };
}

function normalizeData(parsed) {
  const c = parsed.contact || {};
  return {
    contact: {
      number: str(c.number),
      mail: str(c.mail),
      address: str(c.address),
      mapUrl: str(c.mapUrl),
      mapIframe: str(c.mapIframe),
    },
    products: (Array.isArray(parsed.products) ? parsed.products : []).map((p) => ({
      hr_name: str(p.hr_name),
      name: str(p.name),
      hr_description: str(p.hr_description),
      description: str(p.description),
      price: numOrNull(p.price),
      anchorPrice: numOrNull(p.anchorPrice),
      imageDir: str(p.imageDir),
    })),
    services: (Array.isArray(parsed.services) ? parsed.services : []).map((s) => ({
      hr_name: str(s.hr_name),
      name: str(s.name),
      hr_description: str(s.hr_description),
      description: str(s.description),
      imageName: str(s.imageName),
    })),
    about: (Array.isArray(parsed.about) ? parsed.about : []).map((a) => ({
      hr_title: str(a.hr_title),
      title: str(a.title),
      hr_description: str(a.hr_description),
      description: str(a.description),
      imageName: str(a.imageName),
    })),
  };
}

async function handleGetData(res) {
  try {
    if (!fs.existsSync(DATA_JSON)) return sendJson(res, 200, emptyData());
    const raw = await fsp.readFile(DATA_JSON, 'utf8');
    sendJson(res, 200, normalizeData(JSON.parse(raw)));
  } catch (err) {
    sendJson(res, 500, { error: `Greška pri čitanju data.json: ${err.message}` });
  }
}

async function handleSaveData(req, res) {
  try {
    const body = await readBody(req);
    const clean = normalizeData(JSON.parse(body.toString('utf8')));
    await fsp.writeFile(DATA_JSON, JSON.stringify(clean, null, 2) + '\n', 'utf8');
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: `Greška pri spremanju: ${err.message}` });
  }
}

// ---------- config.json (cjenik hr/en) ----------

async function handleGetConfig(res) {
  try {
    const raw = await fsp.readFile(CONFIG_JSON, 'utf8');
    sendJson(res, 200, JSON.parse(raw));
  } catch (err) {
    sendJson(res, 500, { error: `Greška pri čitanju config.json: ${err.message}` });
  }
}

async function handleSaveConfig(req, res) {
  try {
    const body = await readBody(req);
    const parsed = JSON.parse(body.toString('utf8'));
    const current = JSON.parse(await fsp.readFile(CONFIG_JSON, 'utf8'));

    const pl = parsed.priceList || {};
    const curPl = current.priceList || {};
    const mergeLang = (lang) => {
      const incoming = pl[lang] || {};
      const cur = curPl[lang] || {};
      const item = incoming.item || {};
      const curItem = cur.item || {};
      return {
        ...cur,
        fileName: incoming.fileName !== undefined ? str(incoming.fileName) : cur.fileName,
        title: incoming.title !== undefined ? str(incoming.title) : cur.title,
        footer: incoming.footer !== undefined ? String(incoming.footer) : cur.footer,
        item: {
          ...curItem,
          name: item.name !== undefined ? str(item.name) : curItem.name,
          price: item.price !== undefined ? str(item.price) : curItem.price,
          priceOnRequest: item.priceOnRequest !== undefined ? str(item.priceOnRequest) : curItem.priceOnRequest,
          anchorPrice: item.anchorPrice !== undefined ? str(item.anchorPrice) : curItem.anchorPrice,
        },
      };
    };

    const clean = {
      ...current,
      priceList: {
        ...curPl,
        currency: pl.currency !== undefined ? str(pl.currency) : curPl.currency,
        hr: mergeLang('hr'),
        en: mergeLang('en'),
      },
    };

    await fsp.writeFile(CONFIG_JSON, JSON.stringify(clean, null, 2) + '\n', 'utf8');
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: `Greška pri spremanju configa: ${err.message}` });
  }
}

// ---------- Upload slika ----------

// Zapiši buffer u ciljni folder, bez pregaženja (dodaj sufiks ako ime postoji).
async function writeUnique(dir, safeName, buf) {
  await fsp.mkdir(dir, { recursive: true });
  let target = path.join(dir, safeName);
  if (fs.existsSync(target)) {
    const ext = path.extname(safeName);
    const stem = safeName.slice(0, -ext.length);
    let i = 1;
    do {
      target = path.join(dir, `${stem}-${i}${ext}`);
      i++;
    } while (fs.existsSync(target));
  }
  await fsp.writeFile(target, buf);
  return path.basename(target);
}

// POST /api/upload { section, filename, dataBase64, imageDir? }
// section: 'products' | 'services' | 'about' | 'gallery'
async function handleUpload(req, res) {
  try {
    const body = await readBody(req);
    const { section, filename, dataBase64, imageDir } = JSON.parse(body.toString('utf8'));
    const safe = safeImageName(filename);
    if (!safe) {
      return sendJson(res, 400, { error: 'Nedozvoljen naziv ili tip datoteke (dozvoljeno: jpg, jpeg, png, webp, gif).' });
    }
    if (!dataBase64 || typeof dataBase64 !== 'string') {
      return sendJson(res, 400, { error: 'Nedostaju podaci slike.' });
    }
    const base64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
    const buf = Buffer.from(base64, 'base64');

    let dir;
    if (section === 'products') {
      const safeDir = safeDirName(imageDir);
      if (!safeDir) return sendJson(res, 400, { error: 'Proizvod treba imati naziv foldera slika (imageDir).' });
      dir = path.join(IMG_PRODUCTS, safeDir);
    } else if (section === 'services') {
      dir = IMG_SERVICES;
    } else if (section === 'about') {
      dir = IMG_ABOUT;
    } else if (section === 'gallery') {
      dir = IMG_GALLERY;
    } else {
      return sendJson(res, 400, { error: `Nepoznata sekcija: ${section}` });
    }

    const written = await writeUnique(dir, safe, buf);
    sendJson(res, 200, { ok: true, filename: written });
  } catch (err) {
    sendJson(res, 400, { error: `Greška pri uploadu: ${err.message}` });
  }
}

// GET /api/images?section=...&dir=...  -> lista slika u relevantnom folderu
async function handleListImages(req, res, url) {
  try {
    const u = new URL(url, 'http://localhost');
    const section = u.searchParams.get('section') || '';
    let dir;
    if (section === 'products') {
      const safeDir = safeDirName(u.searchParams.get('dir'));
      if (!safeDir) return sendJson(res, 200, { images: [] });
      dir = path.join(IMG_PRODUCTS, safeDir);
    } else if (section === 'services') {
      dir = IMG_SERVICES;
    } else if (section === 'about') {
      dir = IMG_ABOUT;
    } else if (section === 'gallery') {
      dir = IMG_GALLERY;
    } else {
      return sendJson(res, 400, { error: `Nepoznata sekcija: ${section}` });
    }
    if (!fs.existsSync(dir)) return sendJson(res, 200, { images: [] });
    const entries = await fsp.readdir(dir);
    const images = entries.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
    sendJson(res, 200, { images });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

// GET /api/product-dirs -> lista postojećih foldera u images/products
async function handleListProductDirs(res) {
  try {
    await fsp.mkdir(IMG_PRODUCTS, { recursive: true });
    const entries = await fsp.readdir(IMG_PRODUCTS, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    sendJson(res, 200, { dirs });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
}

// POST /api/delete-image { section, filename, imageDir? } -> obriši sliku
async function handleDeleteImage(req, res) {
  try {
    const body = await readBody(req);
    const { section, filename, imageDir } = JSON.parse(body.toString('utf8'));
    const name = path.basename(String(filename || ''));
    if (!name || name.includes('..')) return sendJson(res, 400, { error: 'Nevažeći naziv datoteke.' });

    let dir;
    if (section === 'products') {
      const safeDir = safeDirName(imageDir);
      if (!safeDir) return sendJson(res, 400, { error: 'Nedostaje imageDir.' });
      dir = path.join(IMG_PRODUCTS, safeDir);
    } else if (section === 'services') {
      dir = IMG_SERVICES;
    } else if (section === 'about') {
      dir = IMG_ABOUT;
    } else if (section === 'gallery') {
      dir = IMG_GALLERY;
    } else {
      return sendJson(res, 400, { error: `Nepoznata sekcija: ${section}` });
    }

    const target = path.join(dir, name);
    if (!target.startsWith(dir)) return sendJson(res, 400, { error: 'Nevažeća putanja.' });
    if (fs.existsSync(target)) await fsp.unlink(target);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendJson(res, 400, { error: `Greška pri brisanju: ${err.message}` });
  }
}

// ---------- Export / Import data.xlsx ----------

// GET /api/export-xlsx -> preuzimanje data.xlsx generiranog iz data.json
async function handleExportXlsx(res) {
  try {
    const XLSX = require('xlsx');
    const data = fs.existsSync(DATA_JSON)
      ? normalizeData(JSON.parse(await fsp.readFile(DATA_JSON, 'utf8')))
      : emptyData();

    const wb = XLSX.utils.book_new();

    // contact
    const contactRows = [
      XLSX_HEADERS.contact,
      [data.contact.number, data.contact.mail, data.contact.address, data.contact.mapUrl, data.contact.mapIframe],
    ];
    const wsContact = XLSX.utils.aoa_to_sheet(contactRows);
    wsContact['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 30 }, { wch: 30 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsContact, 'contact');

    // products
    const productRows = [XLSX_HEADERS.products];
    data.products.forEach((p) => productRows.push([
      p.hr_name, p.name, p.hr_description, p.description,
      p.price === null ? '' : p.price,
      p.anchorPrice === null ? '' : p.anchorPrice,
      p.imageDir,
    ]));
    const wsProducts = XLSX.utils.aoa_to_sheet(productRows);
    wsProducts['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 50 }, { wch: 50 }, { wch: 10 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsProducts, 'products');

    // services
    const serviceRows = [XLSX_HEADERS.services];
    data.services.forEach((s) => serviceRows.push([s.hr_name, s.name, s.hr_description, s.description, s.imageName]));
    const wsServices = XLSX.utils.aoa_to_sheet(serviceRows);
    wsServices['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 50 }, { wch: 50 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsServices, 'services');

    // about
    const aboutRows = [XLSX_HEADERS.about];
    data.about.forEach((a) => aboutRows.push([a.hr_title, a.title, a.hr_description, a.description, a.imageName]));
    const wsAbout = XLSX.utils.aoa_to_sheet(aboutRows);
    wsAbout['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 50 }, { wch: 50 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsAbout, 'about');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="data.xlsx"',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (err) {
    sendJson(res, 500, { error: `Greška pri izvozu: ${err.message}` });
  }
}

// POST /api/import-xlsx { dataBase64 } -> parsiraj Excel i vrati data objekt (zamjena)
async function handleImportXlsx(req, res) {
  try {
    const XLSX = require('xlsx');
    const body = await readBody(req);
    const { dataBase64 } = JSON.parse(body.toString('utf8'));
    if (!dataBase64) throw new Error('Nedostaje datoteka.');
    const base64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
    const buf = Buffer.from(base64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Mapiranje Excel zaglavlja -> interni ključevi (prvi red = zaglavlje, range:1).
    const internalHeaders = {
      contact: ['number', 'mail', 'address', 'mapUrl', 'mapIframe'],
      products: ['hr_name', 'name', 'hr_description', 'description', 'price', 'anchorPrice', 'imageDir'],
      services: ['hr_name', 'name', 'hr_description', 'description', 'imageName'],
      about: ['hr_title', 'title', 'hr_description', 'description', 'imageName'],
    };
    const read = (sheet, headers) => {
      const ws = wb.Sheets[sheet];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, { header: headers, range: 1, defval: '' });
    };

    const contactRow = read('contact', internalHeaders.contact)[0] || {};
    const parsed = {
      contact: contactRow,
      products: read('products', internalHeaders.products),
      services: read('services', internalHeaders.services),
      about: read('about', internalHeaders.about),
    };
    const data = normalizeData(parsed);
    sendJson(res, 200, {
      ok: true,
      data,
      count: {
        products: data.products.length,
        services: data.services.length,
        about: data.about.length,
      },
    });
  } catch (err) {
    sendJson(res, 400, { error: `Greška pri uvozu: ${err.message}` });
  }
}

// ---------- Build / status ----------

function handleBuild(res) {
  const child = spawn(process.execPath, ['generator.js'], {
    cwd: GENERATOR_DIR,
    env: process.env,
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d.toString()));
  child.stderr.on('data', (d) => (err += d.toString()));
  child.on('close', (code) => {
    if (code === 0) sendJson(res, 200, { ok: true, log: out });
    else sendJson(res, 500, { ok: false, error: err || `Build izašao s kodom ${code}`, log: out });
  });
  child.on('error', (e) => sendJson(res, 500, { ok: false, error: e.message }));
}

// ---------- Publish (git) ----------

// Pokreni git naredbu, vrati { code, stdout, stderr }. Nikad ne baca.
function runGit(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: process.env });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => resolve({ code, stdout: out, stderr: err }));
    child.on('error', (e) => resolve({ code: -1, stdout: '', stderr: e.message }));
  });
}

// Pokreni generator.js (build). Vrati Promise { code, stdout, stderr }.
function runBuild(cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['generator.js'], { cwd, env: process.env });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => resolve({ code, stdout: out, stderr: err }));
    child.on('error', (e) => resolve({ code: -1, stdout: '', stderr: e.message }));
  });
}

/**
 * POST /api/publish — bulletproof objava na git.
 *
 * Tijek:
 *   1. Provjeri da je ROOT git repo.
 *   2. Generiraj web (generator.js) — ako padne, prekini (ne objavljuj slomljeno).
 *   3. git add -A
 *   4. Ako nema promjena -> ipak pokušaj push (za slučaj da lokalni commit nije pushan).
 *   5. git commit (ako ima staged promjena).
 *   6. git pull --rebase (ako padne/konflikt -> abort rebase i vrati jasnu grešku).
 *   7. git push (uz retry: još jedan pull --rebase + push).
 *
 * Svaki korak loga se u 'log'. Greške su opisne i ne ostavljaju repo u rebase stanju.
 */
async function handlePublish(res) {
  const log = [];
  const addLog = (title, r) => {
    log.push(`$ git ${title}`);
    if (r.stdout && r.stdout.trim()) log.push(r.stdout.trim());
    if (r.stderr && r.stderr.trim()) log.push(r.stderr.trim());
  };

  try {
    // 1. Je li git repo?
    const inside = await runGit(['rev-parse', '--is-inside-work-tree'], ROOT);
    if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
      return sendJson(res, 400, { ok: false, error: 'Projekt nije git repozitorij. Inicijaliziraj git i postavi remote (origin).', log: log.join('\n') });
    }

    // Provjeri da postoji remote 'origin'.
    const remotes = await runGit(['remote'], ROOT);
    const hasOrigin = remotes.stdout.split(/\s+/).includes('origin');
    if (!hasOrigin) {
      return sendJson(res, 400, { ok: false, error: 'Nije postavljen git remote "origin". Postavi ga pa pokušaj ponovno.', log: log.join('\n') });
    }

    // Trenutna grana.
    const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], ROOT);
    const branch = branchRes.stdout.trim() || 'main';

    // 2. Build.
    log.push('$ node generator.js');
    const build = await runBuild(GENERATOR_DIR);
    if (build.stdout && build.stdout.trim()) log.push(build.stdout.trim());
    if (build.code !== 0) {
      if (build.stderr && build.stderr.trim()) log.push(build.stderr.trim());
      return sendJson(res, 500, { ok: false, error: 'Generiranje weba nije uspjelo — objava je prekinuta (nije poslano ništa slomljeno).', log: log.join('\n') });
    }

    // 3. git add -A
    const add = await runGit(['add', '-A'], ROOT);
    addLog('add -A', add);
    if (add.code !== 0) {
      return sendJson(res, 500, { ok: false, error: 'git add nije uspio: ' + add.stderr, log: log.join('\n') });
    }

    // Ima li staged promjena?
    const diff = await runGit(['diff', '--cached', '--quiet'], ROOT);
    const hasChanges = diff.code !== 0; // exit 1 = ima promjena

    // 5. Commit (ako ima promjena).
    if (hasChanges) {
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      const commit = await runGit(['commit', '-m', `Update sadržaja (editor) ${stamp}`], ROOT);
      addLog('commit', commit);
      if (commit.code !== 0) {
        return sendJson(res, 500, { ok: false, error: 'git commit nije uspio: ' + (commit.stderr || commit.stdout), log: log.join('\n') });
      }
    } else {
      log.push('(nema novih promjena za commit — nastavljam na pull/push za slučaj nepushanih commitova)');
    }

    // 6. Pull --rebase (siguran: autostash lokalnih promjena ako ih ima).
    const pull = await runGit(['pull', '--rebase', '--autostash', 'origin', branch], ROOT);
    addLog('pull --rebase --autostash origin ' + branch, pull);
    if (pull.code !== 0) {
      // Prekini eventualni rebase da repo ostane čist.
      const abort = await runGit(['rebase', '--abort'], ROOT);
      addLog('rebase --abort', abort);
      return sendJson(res, 409, {
        ok: false,
        error: 'git pull --rebase nije uspio (vjerojatno konflikt ili nema mrežnog pristupa / SSH ključa). Rebase je prekinut, repo je u sigurnom stanju. Riješi ručno pa pokušaj ponovno.',
        log: log.join('\n'),
      });
    }

    // 7. Push (s jednim retry-em nakon dodatnog pull-a).
    let push = await runGit(['push', 'origin', branch], ROOT);
    addLog('push origin ' + branch, push);
    if (push.code !== 0) {
      // Možda je netko push-ao u međuvremenu -> pokušaj još jednom pull+push.
      const pull2 = await runGit(['pull', '--rebase', '--autostash', 'origin', branch], ROOT);
      addLog('pull --rebase (retry)', pull2);
      if (pull2.code !== 0) {
        await runGit(['rebase', '--abort'], ROOT);
        return sendJson(res, 409, { ok: false, error: 'Push odbijen, a ponovni pull --rebase nije uspio. Riješi ručno.', log: log.join('\n') });
      }
      push = await runGit(['push', 'origin', branch], ROOT);
      addLog('push (retry)', push);
      if (push.code !== 0) {
        return sendJson(res, 500, { ok: false, error: 'git push nije uspio: ' + (push.stderr || push.stdout), log: log.join('\n') });
      }
    }

    sendJson(res, 200, { ok: true, pushed: true, log: log.join('\n') });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: `Neočekivana greška pri objavi: ${err.message}`, log: log.join('\n') });
  }
}

// ---------- Serviranje slika u editor UI ----------
// /img/<section>/<...>  -> mapira na odgovarajući folder; fallback na placeholder.
function serveImage(res, section, rest) {
  let file;
  const parts = rest.split('/').map((p) => path.basename(decodeURIComponent(p)));
  if (section === 'products') {
    // products/<dir>/<file>
    if (parts.length < 2) return servePlaceholder(res);
    file = path.join(IMG_PRODUCTS, parts[0], parts[1]);
  } else if (section === 'services') {
    file = path.join(IMG_SERVICES, parts[0]);
  } else if (section === 'about') {
    file = path.join(IMG_ABOUT, parts[0]);
  } else if (section === 'gallery') {
    file = path.join(IMG_GALLERY, parts[0]);
  } else if (section === 'placeholder') {
    return servePlaceholder(res);
  } else {
    return servePlaceholder(res);
  }
  if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
    const type = STATIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    fs.createReadStream(file).on('error', () => { try { res.end(); } catch {} }).pipe(res);
    return;
  }
  servePlaceholder(res);
}

function servePlaceholder(res) {
  if (fs.existsSync(PLACEHOLDER)) {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    fs.createReadStream(PLACEHOLDER).on('error', () => { try { res.end(); } catch {} }).pipe(res);
    return;
  }
  sendText(res, 404, 'Slika nije pronađena');
}

// ---------- Router ----------

function createServer() {
  return http.createServer(async (req, res) => {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const pathname = url.split('?')[0];

    if (pathname === '/__ping__') {
      return sendJson(res, 200, { signature: SERVER_SIGNATURE });
    }

    // API rute.
    if (pathname === '/api/data' && method === 'GET') return handleGetData(res);
    if (pathname === '/api/data' && method === 'POST') return handleSaveData(req, res);
    if (pathname === '/api/config' && method === 'GET') return handleGetConfig(res);
    if (pathname === '/api/config' && method === 'POST') return handleSaveConfig(req, res);
    if (pathname === '/api/upload' && method === 'POST') return handleUpload(req, res);
    if (pathname === '/api/delete-image' && method === 'POST') return handleDeleteImage(req, res);
    if (pathname === '/api/images' && method === 'GET') return handleListImages(req, res, url);
    if (pathname === '/api/product-dirs' && method === 'GET') return handleListProductDirs(res);
    if (pathname === '/api/export-xlsx' && method === 'GET') return handleExportXlsx(res);
    if (pathname === '/api/import-xlsx' && method === 'POST') return handleImportXlsx(req, res);
    if (pathname === '/api/build' && method === 'POST') return handleBuild(res);
    if (pathname === '/api/publish' && method === 'POST') return handlePublish(res);
    if (pathname === '/api/status' && method === 'GET') {
      return sendJson(res, 200, { built: fs.existsSync(path.join(ROOT, 'index.html')) });
    }

    // Slike za editor UI: /img/<section>/<rest>
    if (method === 'GET' && pathname.startsWith('/img/')) {
      const rest = pathname.slice('/img/'.length);
      const slash = rest.indexOf('/');
      const section = slash >= 0 ? rest.slice(0, slash) : rest;
      const sub = slash >= 0 ? rest.slice(slash + 1) : '';
      return serveImage(res, section, sub);
    }

    // PREVIEW: generirani web iz ROOT-a.
    if (method === 'GET' && (pathname === '/preview' || pathname.startsWith('/preview/'))) {
      const file = resolvePreview(pathname);
      if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = STATIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        fs.createReadStream(file).on('error', () => { try { res.end(); } catch {} }).pipe(res);
        return;
      }
      if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
        return sendText(res, 404, 'Web još nije generiran. Klikni "Spremi i generiraj web" u editoru.');
      }
      return sendText(res, 404, 'Stranica nije pronađena u preview-u.');
    }

    // Statika (editor UI).
    if (method === 'GET') {
      let file = resolveStatic(pathname);
      if (!(file && fs.existsSync(file) && fs.statSync(file).isFile())) {
        file = path.join(EDITOR_DIR, 'index.html');
      }
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = STATIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        fs.createReadStream(file).on('error', () => { try { res.end(); } catch {} }).pipe(res);
        return;
      }
    }

    sendText(res, 404, 'Nije pronađeno');
  });
}

// ---------- Smart port + auto-open ----------

function isWSL() {
  if (process.platform !== 'linux') return false;
  try {
    return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else if (isWSL()) cmd = `explorer.exe "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err && !isWSL()) console.log(`Otvori ručno u pregledniku: ${url}`);
  });
}

function pingIsOurs(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/__ping__', timeout: 800 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data).signature === SERVER_SIGNATURE); }
        catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { server.removeListener('listening', onListening); reject(err); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function start() {
  let port = START_PORT;
  for (let attempt = 0; attempt < MAX_PORT_TRIES; attempt++) {
    const ours = await pingIsOurs(port);
    if (ours) {
      const url = `http://localhost:${port}/`;
      console.log(`Editor već radi na ${url} — otvaram browser (ne dižem novi server).`);
      openBrowser(url);
      return;
    }
    const server = createServer();
    try {
      await tryListen(server, port);
      const url = `http://localhost:${port}/`;
      console.log(`\n  Rasadnik Bernat editor pokrenut: ${url}`);
      console.log('  (Ctrl+C za zaustavljanje)\n');
      openBrowser(url);
      return;
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} zauzet (drugi proces), pokušavam ${port + 1}...`);
        port++;
        continue;
      }
      console.error('Greška pri pokretanju servera:', err.message);
      process.exit(1);
    }
  }
  console.error(`Nije pronađen slobodan port u rasponu ${START_PORT}-${START_PORT + MAX_PORT_TRIES}.`);
  process.exit(1);
}

// ---------- Priprema: ovisnosti + data.json ----------

function ensureDeps() {
  return new Promise((resolve) => {
    const nodeModules = path.join(GENERATOR_DIR, 'node_modules');
    const pkg = path.join(GENERATOR_DIR, 'package.json');
    const lock = path.join(GENERATOR_DIR, 'package-lock.json');
    const installedMarker = path.join(nodeModules, '.package-lock.json');

    let needsInstall = false;
    if (!fs.existsSync(nodeModules) || !fs.existsSync(installedMarker)) {
      needsInstall = true;
    } else {
      try {
        const installedTime = fs.statSync(installedMarker).mtimeMs;
        const pkgTime = fs.existsSync(pkg) ? fs.statSync(pkg).mtimeMs : 0;
        const lockTime = fs.existsSync(lock) ? fs.statSync(lock).mtimeMs : 0;
        if (pkgTime > installedTime || lockTime > installedTime) needsInstall = true;
      } catch {
        needsInstall = true;
      }
    }

    if (!needsInstall) { resolve(); return; }

    const useCi = fs.existsSync(lock);
    const args = useCi ? ['ci'] : ['install'];
    console.log(`Instaliram ovisnosti (npm ${args[0]})…`);
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCmd, args, { cwd: GENERATOR_DIR, stdio: 'inherit', env: process.env });
    child.on('close', (code) => {
      if (code === 0) { console.log('✓ Ovisnosti spremne.'); resolve(); return; }
      if (useCi) {
        console.log('npm ci nije uspio — pokušavam npm install…');
        const retry = spawn(npmCmd, ['install'], { cwd: GENERATOR_DIR, stdio: 'inherit', env: process.env });
        retry.on('close', (c2) => {
          if (c2 !== 0) console.warn('⚠ Instalacija ovisnosti nije uspjela. Editor će raditi, ali "Generiraj web" može pasti dok ručno ne pokreneš: cd generator && npm install');
          resolve();
        });
        retry.on('error', () => resolve());
      } else {
        console.warn('⚠ Instalacija ovisnosti nije uspjela. Pokreni ručno: cd generator && npm install');
        resolve();
      }
    });
    child.on('error', (e) => {
      console.warn(`⚠ Ne mogu pokrenuti npm (${e.message}). Pokreni ručno: cd generator && npm install`);
      resolve();
    });
  });
}

// Osigurava data.json: ako ne postoji, migrira iz data.xlsx; inače kreira prazan.
function ensureDataJson() {
  if (fs.existsSync(DATA_JSON)) return;
  const migrateScript = path.join(GENERATOR_DIR, 'migrate-xlsx-to-json.js');
  if (fs.existsSync(DATA_XLSX) && fs.existsSync(migrateScript)) {
    try {
      console.log('data.json ne postoji — migriram iz data.xlsx…');
      require('node:child_process').execFileSync(process.execPath, [migrateScript], {
        cwd: GENERATOR_DIR,
        stdio: 'inherit',
      });
      if (fs.existsSync(DATA_JSON)) return;
    } catch (e) {
      console.warn(`⚠ Migracija nije uspjela (${e.message}), kreiram prazan data.json.`);
    }
  }
  try {
    fs.writeFileSync(DATA_JSON, JSON.stringify(emptyData(), null, 2) + '\n', 'utf8');
    console.log('✓ Kreiran prazan data.json.');
  } catch (e) {
    console.warn(`⚠ Ne mogu kreirati data.json: ${e.message}`);
  }
}

/**
 * Na pokretanju: povuci najnovije s gita (git pull --rebase --autostash) da
 * urednik kreće od zadnje verzije i izbjegne nepotrebne konflikte pri objavi.
 *
 * Tih i ne-blokirajući za editor: ako nije git repo, nema origin-a, nema mreže
 * ili dođe do konflikta — ispiše upozorenje, prekine eventualni rebase i
 * svejedno pokrene editor (ne smije spriječiti rad lokalno).
 */
async function syncFromGit() {
  try {
    const inside = await runGit(['rev-parse', '--is-inside-work-tree'], ROOT);
    if (inside.code !== 0 || inside.stdout.trim() !== 'true') return; // nije git repo

    const remotes = await runGit(['remote'], ROOT);
    if (!remotes.stdout.split(/\s+/).includes('origin')) {
      console.log('ℹ Nema git remote "origin" — preskačem pull.');
      return;
    }

    const branchRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], ROOT);
    const branch = branchRes.stdout.trim() || 'main';

    console.log(`Povlačim najnovije s gita (pull --rebase origin ${branch})…`);
    const pull = await runGit(['pull', '--rebase', '--autostash', 'origin', branch], ROOT);
    if (pull.code === 0) {
      console.log('✓ Ažurirano s gita.');
    } else {
      // Prekini rebase da repo ostane u sigurnom stanju.
      await runGit(['rebase', '--abort'], ROOT);
      console.warn('⚠ git pull --rebase nije uspio (konflikt ili nema pristupa). Rebase prekinut, editor se svejedno pokreće. Riješi ručno prije objave ako treba.');
    }
  } catch (e) {
    console.warn(`⚠ Preskačem git pull (${e.message}).`);
  }
}

ensureDeps().then(async () => {
  await syncFromGit();
  ensureDataJson();
  return start();
});
