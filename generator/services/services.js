const { readFile } = require('node:fs/promises');
const path = require('node:path');

const servicesTemplatePath = path.join(__dirname, './templates/services.html');
const serviceTemplatePath = path.join(__dirname, './templates/service.html');
const imagesPath = './images/services'

const SERVICE_COL = [
  'col-md-12 col-sm-12 col-12',
  'col-md-6 col-sm-6 col-12',
  'col-md-4 col-sm-6 col-12',
];

async function mapServicesTemplate(html, services) {
  const serviceHTMLs = await getServiceHTMLs(services);
  const servicesTemplate = await readFile(servicesTemplatePath, { encoding: 'utf8' });
  const servicesHTML = servicesTemplate.replaceAll('{{services}}', serviceHTMLs.join('\n'));
  html = html.replaceAll('{{services.html}}', servicesHTML);
  return html;
}

async function getServiceHTMLs(services) {
  const templates = await getTemplates();
  const serviceCol = services.length > 0 ? SERVICE_COL[(Math.min(SERVICE_COL.length, services.length)) - 1] : SERVICE_COL[0];
  return services.map(item => getServiceHTML(serviceCol, item, templates));
}

async function getTemplates() {
  const [
    serviceTemplate
  ] = await Promise.all([
    readFile(serviceTemplatePath, { encoding: 'utf8' })
  ]);
  return { serviceTemplate };
}

function getServiceHTML(serviceCol, item, htmlTemplates) {
  const { serviceTemplate } = htmlTemplates;
  return serviceTemplate
    .replaceAll('{{service-col}}', serviceCol)
    .replaceAll('{{id}}', item.id)
    .replaceAll('{{name}}', item.hr_name)
    .replaceAll('{{image}}', getImagePath(item.imageName))
    .replaceAll('{{imageAlt}}', item.imageAlt)
    .replaceAll('{{description}}', item.hr_description);
}

function getImagePath(name) {
  return `${imagesPath}/${name}`;
}

module.exports = {
  mapServicesTemplate
};