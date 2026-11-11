const { writeFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const enLocale = require('./en.json');
const hrLocale = require('./hr.json');
const { applyTextOverrides, bannerLocales } = require('../common/site');
const config = require('../../config.json');

const localesDirPath = path.join(__dirname, '../js');
const localeKeys = ['name', 'description', 'title'];

async function createLocales(data) {
  const localesFromConfig = getLocalesFromConfig();
  // Korisnički tekstovi iz editora (config.site.texts) prepisuju zadane iz locales/*.json.
  let en = applyTextOverrides({ ...enLocale, ...localesFromConfig.en }, 'en', config.site);
  let hr = applyTextOverrides({ ...hrLocale, ...localesFromConfig.hr }, 'hr', config.site);
  // Nazivi vlastitih gumba na naslovnici (banner.b0, ...)
  const bl = bannerLocales(config.site);
  en = { ...en, ...bl.en };
  hr = { ...hr, ...bl.hr };
  Object.values(data).forEach(item => {
    en = { ...en, ...getLocale(item).en };
    hr = { ...hr, ...getLocale(item).hr };
  });
  await Promise.all([
    writeFile(path.join(localesDirPath, 'en.json'), JSON.stringify(en, null, 2)),
    writeFile(path.join(localesDirPath, 'hr.json'), JSON.stringify(hr, null, 2)),
  ]);
}

async function removeCreatedLocales() {
  try {
    await Promise.all([
      unlink(path.join(localesDirPath, 'en.json')),
      unlink(path.join(localesDirPath, 'hr.json')),
    ]);
  } catch (error) {
    console.warn('Delete js/locale files has failed.');
  }
}

function getLocale(data) {
  let en = {};
  let hr = {};
  data.forEach((item) => {
    const _en = {};
    const _hr = {};
    for (const [key, value] of Object.entries(item)) {
      if (key.startsWith('hr_')) {
        const _key = key.split('hr_').pop();
        if (!localeKeys.includes(_key)) continue;
        _hr[_key] = value;
      } else {
        if (!localeKeys.includes(key)) continue;
        _en[key] = value;
      }
    }
    const localeKey = item.id || uuidv4();
    // Prazan engleski tekst -> hrvatski (inače bi se na EN prikazao prazan naziv/opis).
    Object.keys(_hr).forEach((k) => {
      if (_en[k] === undefined || _en[k] === null || String(_en[k]).trim() === '') _en[k] = _hr[k];
    });
    en = { ...en, [localeKey]: _en };
    hr = { ...hr, [localeKey]: { ..._en, ..._hr } };
  });
  return { en, hr };
}

function getLocalesFromConfig() {
  const en = {
    priceOnRequest: config.priceList.en.item.priceOnRequest,
    anchorPrice: config.priceList.en.item.anchorPrice,
    fileName: config.priceList.en.fileName,
  };
  const hr = {
    priceOnRequest: config.priceList.hr.item.priceOnRequest,
    anchorPrice: config.priceList.hr.item.anchorPrice,
    fileName: config.priceList.hr.fileName,
  };
  return { en, hr };
}

module.exports = {
  createLocales,
  removeCreatedLocales
};