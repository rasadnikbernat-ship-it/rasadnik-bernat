const { writeFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { v4: uuidv4 } = require('uuid');
const enLocale = require('./en.json');
const hrLocale = require('./hr.json');
const config = require('../../config.json');

const localesDirPath = path.join(__dirname, '../js');
const localeKeys = ['name', 'description', 'title']

async function createLocales(data) {
  const localesFromConfig = getLocalesFromConfig();
  let en = { ...enLocale, ...localesFromConfig.en };
  let hr = { ...hrLocale, ...localesFromConfig.hr };
  Object.values(data).forEach(item => {
    en = { ...en, ...getLocale(item).en };
    hr = { ...hr, ...getLocale(item).hr };
  });
  await Promise.all([
    writeFile(`${localesDirPath}/en.json`, JSON.stringify(en, null, 2)),
    writeFile(`${localesDirPath}/hr.json`, JSON.stringify(hr, null, 2)),
  ]);
}

async function removeCreatedLocales(params) {
  try {
    await Promise.all([
      unlink(`${localesDirPath}/en.json`),
      unlink(`${localesDirPath}/hr.json`)
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
    en = { ...en, [localeKey]: _en };
    hr = { ...hr, [localeKey]: { ..._en, ..._hr } };
  });
  return { en, hr };
}

function getLocalesFromConfig() {
  let en = {
    priceOnRequest: config.priceList.en.item.priceOnRequest,
    anchorPrice: config.priceList.en.item.anchorPrice,
    fileName: config.priceList.en.fileName
  };
  let hr = {
    priceOnRequest: config.priceList.hr.item.priceOnRequest,
    anchorPrice: config.priceList.hr.item.anchorPrice,
    fileName: config.priceList.hr.fileName
  };
  return { en, hr };
}

module.exports = {
  createLocales,
  removeCreatedLocales
};