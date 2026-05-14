const { readFile } = require('node:fs/promises');
const path = require('node:path');

const aboutTemplatePath = path.join(__dirname, './templates/about.html');
const aboutSlideBtnTemplatePath = path.join(__dirname, './templates/about-item-slide-btn.html');
const aboutItemTemplatePath = path.join(__dirname, './templates/about-item.html');
const imagesPath = './images/about'

async function mapAboutTemplate(html, about) {
  const { items, buttons } = await getAboutItemAndBtnHTMLs(about);
  const aboutTemplate = await readFile(aboutTemplatePath, { encoding: 'utf8' });
  const aboutHTML = aboutTemplate
    .replaceAll('{{buttons}}', buttons.join('\n'))
    .replaceAll('{{items}}', items.join('\n'));
  html = html.replaceAll('{{about.html}}', aboutHTML);
  return html;
}

async function getAboutItemAndBtnHTMLs(about) {
  const { aboutSlideBtnTemplate, aboutItemTemplate } = await getTemplates();
  const buttons = [];
  const items = [];
  about.forEach((item, index) => {
    buttons.push(getBtn(item, index, aboutSlideBtnTemplate));
    items.push(getItem(item, index, aboutItemTemplate))
  });
  return { buttons, items };
}

async function getTemplates() {
  const [
    aboutSlideBtnTemplate,
    aboutItemTemplate
  ] = await Promise.all([
    readFile(aboutSlideBtnTemplatePath, { encoding: 'utf8' }),
    readFile(aboutItemTemplatePath, { encoding: 'utf8' })
  ]);
  return { aboutSlideBtnTemplate, aboutItemTemplate };
}

function getBtn(item, slide, template) {
  return template
    .replaceAll('{{id}}', item.id)
    .replaceAll('{{slide}}', slide)
    .replaceAll('{{productAriaLabel}}', item.imageAlt)
    .replaceAll('{{active}}', slide === 0 ? 'class="active" aria-current="true"' : '');
}

function getItem(item, slide, template) {
  return template
    .replaceAll('{{id}}', item.id)
    .replaceAll('{{title}}', item.hr_title)
    .replaceAll('{{description}}', item.hr_description)
    .replaceAll('{{image}}', getImagePath(item.imageName))
    .replaceAll('{{alt}}', item.imageAlt)
    .replaceAll('{{active}}', slide === 0 ? 'active' : '')
    .replaceAll('{{reverse}}', (slide + 1) % 2 === 0 ? 'flex-row-reverse' : '');
}

function getImagePath(name) {
  return `${imagesPath}/${name}`;
}

module.exports = {
  mapAboutTemplate
};