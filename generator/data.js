const path = require('node:path');
const XLSX = require("xlsx");
const { v4: uuidv4 } = require('uuid');

const dataPath = path.join(__dirname, '../data.xlsx');
const contactWorksheetName = 'contact';
const contactHeaders = ['number', 'mail', 'address', 'mapUrl', 'mapIframe'];
const productsWorksheetName = 'products';
const productsHeaders = ['hr_name', 'name', 'hr_description', 'description', 'price', 'anchorPrice', 'imageDir'];
const servicesWorksheetName = 'services';
const servicesHeaders = ['hr_name', 'name', 'hr_description', 'description', 'imageName'];
const aboutWorksheetName = 'about';
const aboutHeaders = ['hr_title', 'title', 'hr_description', 'description', 'imageName'];

function getData() {
  const workbook = XLSX.readFile(dataPath);

  const contactWorksheet = workbook.Sheets[contactWorksheetName];
  if (!contactWorksheet) throw new Error(`Excel sheet "${contactWorksheetName}" not found`);
  const contact = XLSX.utils.sheet_to_json(contactWorksheet, { header: contactHeaders, range: 1 });

  const productsWorksheet = workbook.Sheets[productsWorksheetName];
  if (!productsWorksheet) throw new Error(`Excel sheet "${productsWorksheetName}" not found`);
  const products = XLSX.utils.sheet_to_json(productsWorksheet, { header: productsHeaders, range: 1 });

  const servicesWorksheet = workbook.Sheets[servicesWorksheetName];
  if (!servicesWorksheet) throw new Error(`Excel sheet "${servicesWorksheetName}" not found`);
  const services = XLSX.utils.sheet_to_json(servicesWorksheet, { header: servicesHeaders, range: 1 });

  const aboutWorksheet = workbook.Sheets[aboutWorksheetName];
  if (!aboutWorksheet) throw new Error(`Excel sheet "${aboutWorksheetName}" not found`);
  const about = XLSX.utils.sheet_to_json(aboutWorksheet, { header: aboutHeaders, range: 1 });

  return {
    contact: contact[0],
    products: prepareProductsData(products),
    services: prepareServicesData(services),
    about: prepareAboutData(about),
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