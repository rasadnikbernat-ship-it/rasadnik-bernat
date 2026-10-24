const { readFile } = require('node:fs/promises');
const path = require('node:path');

const contactTemplatePath = path.join(__dirname, './templates/contact.html');

async function mapContactTemplate(html, contact) {
  if (!contact) {
    console.warn('Contact data is missing — skipping contact section.');
    return html.replaceAll('{{contact.html}}', '');
  }
  const contactTemplate = await readFile(contactTemplatePath, { encoding: 'utf8' });
  const contactHTML = contactTemplate
    .replaceAll('{{number}}', contact.number ?? '')
    .replaceAll('{{mail}}', contact.mail ?? '')
    .replaceAll('{{address}}', contact.address ?? '')
    .replaceAll('{{mapUrl}}', contact.mapUrl ?? '')
    .replaceAll('{{mapIframe}}', contact.mapIframe ?? '');
  html = html.replaceAll('{{contact.html}}', contactHTML);
  return html;
}

module.exports = {
  mapContactTemplate
};
