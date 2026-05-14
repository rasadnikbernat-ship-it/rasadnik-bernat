const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');

const templatesDir = path.join(__dirname, './templates');

async function mapCommonTemplates(html) {
  const templates = await getTemplates();
  templates.forEach(template => html = html.replaceAll(`{{${template.name}}}`, template.html));
  return html;
}

async function getTemplates() {
  const fileNames = await readdir(templatesDir);
  return await Promise.all(fileNames.map(getTemplate))
}

async function getTemplate(name) {
  const html = await readFile(`${templatesDir}/${name}`, { encoding: 'utf8' });
  return { name, html };
}

module.exports = {
  mapCommonTemplates
};