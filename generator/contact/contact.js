const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { renderSocial } = require('./social');
const { escapeHtml } = require('../common/site');

// Link na kartu: samo http(s), inače '#' (sprječava javascript: i slično).
function safeUrl(u) {
  const v = String(u ?? '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : '#';
}

const contactTemplatePath = path.join(__dirname, './templates/contact.html');

async function mapContactTemplate(html, contact) {
  if (!contact) {
    console.warn('Contact data is missing — skipping contact section.');
    return html.replaceAll('{{contact.html}}', '');
  }
  const contactTemplate = await readFile(contactTemplatePath, { encoding: 'utf8' });
  const contactHTML = contactTemplate
    .replaceAll('{{number}}', () => escapeHtml(contact.number ?? ''))
    .replaceAll('{{mail}}', () => escapeHtml(contact.mail ?? ''))
    .replaceAll('{{address}}', () => escapeHtml(contact.address ?? ''))
    .replaceAll('{{mapUrl}}', () => escapeHtml(safeUrl(contact.mapUrl ?? '')))
    .replaceAll('{{social.html}}', () => renderSocial(contact.social))
    .replaceAll('{{mapIframe}}', () => contact.mapIframe ?? '');
  html = html.replaceAll('{{contact.html}}', () => contactHTML);
  return html;
}

module.exports = {
  mapContactTemplate
};
